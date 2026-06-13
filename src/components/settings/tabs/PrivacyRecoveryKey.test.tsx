import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivacyRecoveryKey } from './PrivacyRecoveryKey';
import {
  generateRecoveryKey,
  storeRecoveryKey,
  disableRecoveryKey,
  isRecoveryKeyEnabled,
} from '../../../lib/services/recoveryKeyService';

vi.mock('../../../lib/services/recoveryKeyService', () => ({
  generateRecoveryKey: vi.fn(() => 'TEST-KEYS-2345-6789-ABCD-EFGH'),
  storeRecoveryKey: vi.fn().mockResolvedValue(undefined),
  disableRecoveryKey: vi.fn().mockResolvedValue(undefined),
  isRecoveryKeyEnabled: vi.fn().mockResolvedValue(false),
}));

const mockEnabled = vi.mocked(isRecoveryKeyEnabled);
const mockStore = vi.mocked(storeRecoveryKey);
const mockDisable = vi.mocked(disableRecoveryKey);
const mockGenerate = vi.mocked(generateRecoveryKey);

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerate.mockReturnValue('TEST-KEYS-2345-6789-ABCD-EFGH');
  mockEnabled.mockResolvedValue(false);
  mockStore.mockResolvedValue(undefined);
  mockDisable.mockResolvedValue(undefined);
});

describe('PrivacyRecoveryKey — idle states', () => {
  it('prompts to unlock when no session password is available', async () => {
    render(<PrivacyRecoveryKey sessionPassword="" />);
    await waitFor(() =>
      expect(screen.getByText(/lock and re-unlock to manage/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /generate recovery key/i })).toBeDisabled();
  });

  it('shows "no recovery key set" + enabled Generate when disabled and unlocked', async () => {
    render(<PrivacyRecoveryKey sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByText(/no recovery key set/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /generate recovery key/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
  });

  it('shows active state with Regenerate + Remove when a key is enabled', async () => {
    mockEnabled.mockResolvedValue(true);
    render(<PrivacyRecoveryKey sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByText(/a recovery key is active/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
  });
});

describe('PrivacyRecoveryKey — generate flow', () => {
  it('reveals the generated key and gates Save behind the confirmation checkbox', async () => {
    render(<PrivacyRecoveryKey sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate recovery key/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /generate recovery key/i }));

    // Key is displayed; Save is disabled until the user confirms they wrote it down.
    expect(screen.getByText('TEST-KEYS-2345-6789-ABCD-EFGH')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /save recovery key/i });
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(save).toBeEnabled();
  });

  it('stores the key under the session password and shows confirmation', async () => {
    render(<PrivacyRecoveryKey sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate recovery key/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /generate recovery key/i }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /save recovery key/i }));

    await waitFor(() =>
      expect(screen.getByText(/recovery key saved/i)).toBeInTheDocument()
    );
    expect(mockStore).toHaveBeenCalledWith('TEST-KEYS-2345-6789-ABCD-EFGH', 'secret');
    // Now reflects the enabled state.
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('surfaces an error when saving fails', async () => {
    mockStore.mockRejectedValueOnce(new Error('boom'));
    render(<PrivacyRecoveryKey sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate recovery key/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /generate recovery key/i }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /save recovery key/i }));

    await waitFor(() =>
      expect(screen.getByText(/failed to save recovery key/i)).toBeInTheDocument()
    );
  });

  it('Cancel returns to idle without storing', async () => {
    render(<PrivacyRecoveryKey sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate recovery key/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /generate recovery key/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByText(/no recovery key set/i)).toBeInTheDocument();
    expect(mockStore).not.toHaveBeenCalled();
  });
});

describe('PrivacyRecoveryKey — remove flow', () => {
  it('disables the recovery key and returns to the empty state', async () => {
    mockEnabled.mockResolvedValue(true);
    render(<PrivacyRecoveryKey sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    await waitFor(() =>
      expect(screen.getByText(/no recovery key set/i)).toBeInTheDocument()
    );
    expect(mockDisable).toHaveBeenCalledTimes(1);
  });
});
