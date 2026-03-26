import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeCapsuleRevealModal } from './TimeCapsuleRevealModal';
import type { CapsuleEntryRow } from '../../lib/timeCapsuleService';

vi.mock('../../lib/timeCapsuleService', () => ({
  getMoodDelta: vi.fn(),
}));

vi.mock('../../lib/crypto', () => ({
  decrypt: vi.fn(),
}));

import { getMoodDelta } from '../../lib/timeCapsuleService';
import { decrypt } from '../../lib/crypto';
const mockGetMoodDelta = vi.mocked(getMoodDelta);
const mockDecrypt = vi.mocked(decrypt);

beforeEach(() => { vi.clearAllMocks(); });

const baseCapsule: CapsuleEntryRow = {
  id: 'cap-1',
  encrypted_content: { ciphertext: 'abc', iv: 'iv1', salt: 'salt1', version: 1 },
  mood: 4,
  privacy_mode: 0,
  book_id: 'default',
  pinned: false,
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  tags: [],
  sealed_until: null,
  capsule_type: 'letter',
  linked_original_id: null,
  unsealed_at: null,
};

const baseProps = {
  capsule: baseCapsule,
  password: 'test-password',
  onReveal: vi.fn().mockResolvedValue(undefined),
  onWriteResponse: vi.fn(),
  onDismiss: vi.fn(),
};

describe('TimeCapsuleRevealModal', () => {
  it('shows loading state while decrypting', () => {
    mockDecrypt.mockReturnValue(new Promise(() => {}));
    mockGetMoodDelta.mockReturnValue(new Promise(() => {}));
    render(<TimeCapsuleRevealModal {...baseProps} />);
    expect(screen.getByText('Decrypting…')).toBeInTheDocument();
  });

  it('shows error when decrypt fails', async () => {
    mockDecrypt.mockResolvedValue({ success: false, error: 'Bad key' });
    mockGetMoodDelta.mockResolvedValue({ avg_since: null, mood_today: null });
    render(<TimeCapsuleRevealModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('Could not decrypt this entry.')).toBeInTheDocument();
    });
  });

  it('renders decrypted content', async () => {
    mockDecrypt.mockResolvedValue({ success: true, data: '<p>Hello past self</p>' });
    mockGetMoodDelta.mockResolvedValue({ avg_since: null, mood_today: null });
    render(<TimeCapsuleRevealModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('Hello past self')).toBeInTheDocument();
    });
  });

  it('shows mood-improved chip when mood_today > avg_since + 0.3', async () => {
    mockDecrypt.mockResolvedValue({ success: true, data: '<p>content</p>' });
    mockGetMoodDelta.mockResolvedValue({ avg_since: 3.0, mood_today: 4.5 });
    render(<TimeCapsuleRevealModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText(/mood has improved/i)).toBeInTheDocument();
    });
  });

  it('shows mood-changed chip when mood_today < avg_since - 0.3', async () => {
    mockDecrypt.mockResolvedValue({ success: true, data: '<p>content</p>' });
    mockGetMoodDelta.mockResolvedValue({ avg_since: 4.5, mood_today: 3.0 });
    render(<TimeCapsuleRevealModal {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText(/mood has changed/i)).toBeInTheDocument();
    });
  });

  it('calls onReveal when "I\'ve read this" is clicked', async () => {
    mockDecrypt.mockResolvedValue({ success: true, data: '<p>content</p>' });
    mockGetMoodDelta.mockResolvedValue({ avg_since: null, mood_today: null });
    render(<TimeCapsuleRevealModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /i've read this/i }));
    expect(baseProps.onReveal).toHaveBeenCalledWith('cap-1');
  });

  it('calls onReveal then onWriteResponse when "Write a response" is clicked', async () => {
    mockDecrypt.mockResolvedValue({ success: true, data: '<p>content</p>' });
    mockGetMoodDelta.mockResolvedValue({ avg_since: null, mood_today: null });
    render(<TimeCapsuleRevealModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /write a response/i }));
    await waitFor(() => {
      expect(baseProps.onReveal).toHaveBeenCalledWith('cap-1');
      expect(baseProps.onWriteResponse).toHaveBeenCalled();
    });
  });

  it('calls onDismiss when ESC is pressed', async () => {
    mockDecrypt.mockReturnValue(new Promise(() => {}));
    mockGetMoodDelta.mockReturnValue(new Promise(() => {}));
    render(<TimeCapsuleRevealModal {...baseProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(baseProps.onDismiss).toHaveBeenCalled();
  });

  it('has aria-modal and dialog role', () => {
    mockDecrypt.mockReturnValue(new Promise(() => {}));
    mockGetMoodDelta.mockReturnValue(new Promise(() => {}));
    render(<TimeCapsuleRevealModal {...baseProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
