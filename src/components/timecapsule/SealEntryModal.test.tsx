import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SealEntryModal } from './SealEntryModal';

vi.mock('../../lib/timeCapsuleService', () => ({
  sealEntry: vi.fn(),
}));

import { sealEntry } from '../../lib/timeCapsuleService';
const mockSealEntry = vi.mocked(sealEntry);

beforeEach(() => vi.clearAllMocks());

describe('SealEntryModal', () => {
  const baseProps = {
    entryId: 'entry-1',
    defaultDays: 30,
    onSeal: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders cancel and seal buttons', () => {
    render(<SealEntryModal {...baseProps} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /seal entry/i })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    render(<SealEntryModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(baseProps.onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when ESC is pressed', () => {
    render(<SealEntryModal {...baseProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(baseProps.onCancel).toHaveBeenCalled();
  });

  it('calls sealEntry with UTC ISO string on confirm', async () => {
    mockSealEntry.mockResolvedValue(undefined);
    render(<SealEntryModal {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: /seal entry/i }));

    await waitFor(() => {
      expect(mockSealEntry).toHaveBeenCalledWith(
        'entry-1',
        expect.stringMatching(/T00:00:00Z$/),
        'letter',
      );
    });
    expect(baseProps.onSeal).toHaveBeenCalled();
  });

  it('shows error when sealEntry rejects', async () => {
    mockSealEntry.mockRejectedValue(new Error('Network error'));
    render(<SealEntryModal {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: /seal entry/i }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('has aria-modal and dialog role', () => {
    render(<SealEntryModal {...baseProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
