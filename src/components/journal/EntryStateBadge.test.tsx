import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { EntryStateBadge } from './EntryStateBadge';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EntryStateBadge', () => {
  it('J2-1: clicking badge cycles Still thinking → Complete → Come back to this', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<EntryStateBadge entryId="e1" status="thinking" />);
    expect(screen.getByLabelText('Entry status: Still thinking')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Entry status: Complete')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Entry status: Come back to this')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Entry status: Still thinking')).toBeInTheDocument();
  });

  it('J2-2: calls invoke("patch_entry_status", { id, status }) on state change', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<EntryStateBadge entryId="abc123" status="thinking" />);
    await user.click(screen.getByRole('button'));

    expect(mockInvoke).toHaveBeenCalledWith('patch_entry_status', {
      id: 'abc123',
      status: 'complete',
    });
  });

  it('J2-3: optimistic update shows new state immediately; reverts on IPC reject', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC failed'));
    const user = userEvent.setup();

    render(<EntryStateBadge entryId="e1" status="complete" />);
    expect(screen.getByLabelText('Entry status: Complete')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));

    // Reverted back to complete after rejection
    await waitFor(() =>
      expect(screen.getByLabelText('Entry status: Complete')).toBeInTheDocument(),
    );
  });

  it('J2-4: status=undefined renders "Complete" default without crash', () => {
    render(<EntryStateBadge entryId="e1" status={undefined} />);
    expect(screen.getByLabelText('Entry status: Complete')).toBeInTheDocument();
  });
});
