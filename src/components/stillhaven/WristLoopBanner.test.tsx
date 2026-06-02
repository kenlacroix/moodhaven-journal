import { render, screen, fireEvent } from '@testing-library/react';
import { WristLoopBanner } from './WristLoopBanner';
import type { WristLoopTrigger } from '../../hooks/useWristLoop';

function makeTrigger(overrides: Partial<WristLoopTrigger> = {}): WristLoopTrigger {
  return {
    signalId: 'sig-1',
    timestamp: '2026-05-31T10:00:00Z',
    protocol: 'general_activation',
    ...overrides,
  };
}

describe('WristLoopBanner', () => {
  it('renders "General Activation" label for general_activation protocol', () => {
    render(<WristLoopBanner trigger={makeTrigger()} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/General Activation/)).toBeInTheDocument();
  });

  it('renders "Fake Danger" label for fake_danger protocol', () => {
    render(<WristLoopBanner trigger={makeTrigger({ protocol: 'fake_danger' })} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/Fake Danger/)).toBeInTheDocument();
  });

  it('renders "General Activation" as fallback when protocol is undefined', () => {
    render(<WristLoopBanner trigger={makeTrigger({ protocol: undefined })} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/General Activation/)).toBeInTheDocument();
  });

  it('clicking "Start StillHaven" calls onAccept', () => {
    const onAccept = vi.fn();
    render(<WristLoopBanner trigger={makeTrigger()} onAccept={onAccept} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByText('Start StillHaven'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('clicking "Not now" calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(<WristLoopBanner trigger={makeTrigger()} onAccept={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Not now'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('clicking the X dismiss button calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(<WristLoopBanner trigger={makeTrigger()} onAccept={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows the watch emoji icon', () => {
    render(<WristLoopBanner trigger={makeTrigger()} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('⌚')).toBeInTheDocument();
  });

  it('renders raw protocol string when key is not in PROTOCOL_LABELS', () => {
    render(<WristLoopBanner trigger={makeTrigger({ protocol: 'custom_protocol' as 'general_activation' })} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/custom_protocol/)).toBeInTheDocument();
  });
});
