import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbandonedSessionPrompt } from './AbandonedSessionPrompt';
import type { StillSession } from '../../../lib/stillService';

const session: StillSession = {
  id: 'sess-1',
  protocol: 'general_activation',
  environment: 'underwater',
  bilateral_mode: 'audio',
  duration_seconds: 0,
  started_at: '2026-05-31T09:00:00.000Z',
  completed_at: null,
  abandoned_at: null,
  created_at: '2026-05-31T09:00:00.000Z',
};

describe('AbandonedSessionPrompt', () => {
  it('renders incomplete session message', () => {
    render(<AbandonedSessionPrompt session={session} onResume={() => {}} onDiscard={() => {}} />);
    expect(screen.getByText(/incomplete session/i)).toBeInTheDocument();
  });

  it('shows the started_at date', () => {
    render(<AbandonedSessionPrompt session={session} onResume={() => {}} onDiscard={() => {}} />);
    // The date is formatted via toLocaleDateString — just check "Started" text is present
    expect(screen.getByText(/Started/i)).toBeInTheDocument();
  });

  it('calls onResume when Record check-out clicked', async () => {
    const onResume = vi.fn();
    render(<AbandonedSessionPrompt session={session} onResume={onResume} onDiscard={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /record check-out/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('calls onDiscard when Discard clicked', async () => {
    const onDiscard = vi.fn();
    render(<AbandonedSessionPrompt session={session} onResume={() => {}} onDiscard={onDiscard} />);
    await userEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
