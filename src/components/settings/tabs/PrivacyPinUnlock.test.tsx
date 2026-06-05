import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { PrivacyPinUnlock } from './PrivacyPinUnlock';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: PIN not enabled
  mockInvoke.mockResolvedValue(false);
});

describe('PrivacyPinUnlock — idle, PIN disabled', () => {
  it('shows "PIN unlock is not set up" when disabled', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() => {
      expect(screen.getByText(/PIN unlock is not set up/i)).toBeInTheDocument();
    });
  });

  it('shows "Set up" button when PIN is not enabled', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument();
    });
  });
});

describe('PrivacyPinUnlock — idle, PIN enabled', () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(true);
  });

  it('shows "PIN unlock is enabled" when enabled', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() => {
      expect(screen.getByText(/PIN unlock is enabled/i)).toBeInTheDocument();
    });
  });

  it('shows "Disable" button when PIN is enabled', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    });
  });
});

describe('PrivacyPinUnlock — setup flow', () => {
  it('clicking Set up transitions to enter step', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    expect(screen.getByLabelText(/choose a pin/i)).toBeInTheDocument();
  });

  it('stays on idle and does not enter setup when sessionPassword is empty', async () => {
    render(<PrivacyPinUnlock sessionPassword="" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    // Should remain on idle — no PIN input rendered
    expect(screen.queryByLabelText(/choose a pin/i)).not.toBeInTheDocument();
    // "Set up" button still present (didn't navigate away)
    expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument();
  });

  it('Next button is disabled for too-short PIN (< 4 digits)', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    const input = screen.getByLabelText(/choose a pin/i);
    await userEvent.type(input, '12');
    // Next is disabled — component enforces minimum length
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('advances to confirm step after valid 4-digit PIN', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    const input = screen.getByLabelText(/choose a pin/i);
    await userEvent.type(input, '1234');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByLabelText(/confirm pin/i)).toBeInTheDocument();
  });

  it('shows error when PINs do not match on confirm', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    await userEvent.type(screen.getByLabelText(/choose a pin/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await userEvent.type(screen.getByLabelText(/confirm pin/i), '5678');
    // Save PIN button
    await userEvent.click(screen.getByRole('button', { name: /save pin/i }));
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
  });

  it('calls pin_setup and transitions to enabled state on success', async () => {
    mockInvoke
      .mockResolvedValueOnce(false) // pin_is_enabled on mount
      .mockResolvedValueOnce(undefined); // pin_setup

    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    await userEvent.type(screen.getByLabelText(/choose a pin/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await userEvent.type(screen.getByLabelText(/confirm pin/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /save pin/i }));

    await waitFor(() => {
      expect(screen.getByText(/PIN unlock is enabled/i)).toBeInTheDocument();
    });
    expect(mockInvoke).toHaveBeenCalledWith('pin_setup', {
      password: 'secret',
      pin: '1234',
    });
  });

  it('shows backend error on pin_setup failure', async () => {
    mockInvoke
      .mockResolvedValueOnce(false) // pin_is_enabled on mount
      .mockRejectedValueOnce(new Error('Session is locked')); // pin_setup fails

    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    await userEvent.type(screen.getByLabelText(/choose a pin/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await userEvent.type(screen.getByLabelText(/confirm pin/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /save pin/i }));

    await waitFor(() => {
      expect(screen.getByText(/Session is locked/i)).toBeInTheDocument();
    });
  });

  it('Cancel button returns to idle from enter step', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    expect(screen.getByLabelText(/choose a pin/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByText(/PIN unlock is not set up/i)).toBeInTheDocument();
  });

  it('Back button returns to enter step from confirm step', async () => {
    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /set up/i }));
    await userEvent.type(screen.getByLabelText(/choose a pin/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByLabelText(/confirm pin/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText(/choose a pin/i)).toBeInTheDocument();
  });
});

describe('PrivacyPinUnlock — disable flow', () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(true); // pin_is_enabled returns true
  });

  it('calls pin_disable and transitions to disabled state on success', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)      // pin_is_enabled on mount
      .mockResolvedValueOnce(undefined); // pin_disable

    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => {
      expect(screen.getByText(/PIN unlock is not set up/i)).toBeInTheDocument();
    });
    expect(mockInvoke).toHaveBeenCalledWith('pin_disable');
  });

  it('remains on enabled state when pin_disable fails (state not changed)', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('Session is locked'));

    render(<PrivacyPinUnlock sessionPassword="secret" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /disable/i }));

    // enabled state must remain — disable call failed
    await waitFor(() => {
      expect(screen.getByText(/PIN unlock is enabled/i)).toBeInTheDocument();
    });
    // Disable button must still be present (not navigated away)
    expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
  });
});
