/**
 * LockScreen PIN unlock step tests
 *
 * Covers the new `step === 'pin'` UI branch added in feat/pin-unlock:
 * - "Use PIN" link visibility (shown only when pinEnabled)
 * - Navigation to PIN step and back
 * - Correct PIN → unlock
 * - Incorrect PIN → error message
 * - Locked-out response (locked:{secs} → countdown shown)
 * - Stale-password error path
 * - 2FA required after PIN success
 * - PIN with 2FA success then finalizeUnlock
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import { LockScreen } from './LockScreen';

const mockInvoke = vi.mocked(invoke);

// Minimal store mocks
const mockUnlock = vi.fn();
const mockFinalizeUnlock = vi.fn();

vi.mock('../stores/appStore', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('../lib/services/twoFactorService', () => ({
  get2FAStatus: vi.fn().mockResolvedValue({ enabled: false, method: null, has_backup_codes: false }),
  getBackupCodesCount: vi.fn().mockResolvedValue(5),
  verify2FATOTP: vi.fn(),
  verifyBackupCode: vi.fn(),
}));

vi.mock('../lib/services/journalService', () => ({
  verifyUserPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/services/dataManagementService', () => ({
  factoryReset: vi.fn(),
  exitApp: vi.fn(),
}));

vi.mock('../lib/services/recoveryKeyService', () => ({
  recoverPassword: vi.fn(),
  isRecoveryKeyEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('../lib/services/biometricService', () => ({
  biometricIsAvailable: vi.fn().mockResolvedValue(false),
  biometricIsEnrolled: vi.fn().mockResolvedValue(false),
  biometricAuthenticate: vi.fn(),
  biometricEnroll: vi.fn(),
}));

vi.mock('../lib/services/rateLimitService', () => ({
  loadRateLimitState: vi.fn().mockResolvedValue({
    failedAttempts: 0,
    lockoutUntil: null,
    lastFailedAt: null,
  }),
  recordFailedAttempt: vi.fn().mockResolvedValue({
    failedAttempts: 1,
    lockoutUntil: null,
    lastFailedAt: Date.now(),
  }),
  resetRateLimit: vi.fn().mockResolvedValue(undefined),
  isLockedOut: vi.fn().mockReturnValue(false),
  getRemainingLockoutMs: vi.fn().mockReturnValue(0),
  getRemainingFreeAttempts: vi.fn().mockReturnValue(4),
  getNextLockoutDuration: vi.fn().mockReturnValue(30000),
  formatDuration: vi.fn().mockReturnValue('30s'),
}));

function setupStore(overrides = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.mocked(useAppStore) as any).mockImplementation((selector: (s: unknown) => unknown) =>
    selector({
      isInitialized: true,
      isUnlocked: false,
      sessionPassword: null,
      theme: 'system',
      checkInitialization: vi.fn(),
      initialize: vi.fn(),
      unlock: mockUnlock,
      finalizeUnlock: mockFinalizeUnlock,
      lock: vi.fn(),
      setTheme: vi.fn(),
      ...overrides,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupStore();
  // Default: PIN disabled, so pin_is_enabled returns false
  mockInvoke.mockResolvedValue(false);
});

describe('LockScreen — PIN feature visibility', () => {
  it('does not show "Use PIN" link when PIN is disabled', async () => {
    mockInvoke.mockResolvedValue(false);
    render(<LockScreen />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /use pin/i })).not.toBeInTheDocument();
    });
  });

  it('shows "Use PIN" link when PIN is enabled', async () => {
    mockInvoke.mockResolvedValue(true);
    render(<LockScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument();
    });
  });
});

describe('LockScreen — PIN step navigation', () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(true); // pin enabled
  });

  it('clicking "Use PIN" shows the PIN input form', async () => {
    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    expect(screen.getByLabelText(/^PIN$/i)).toBeInTheDocument();
  });

  it('"Back" button from PIN step returns to password step', async () => {
    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });
});

describe('LockScreen — PIN submit: success path (no 2FA)', () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(true); // pin_is_enabled
    mockUnlock.mockResolvedValue(true);
  });

  it('calls pinUnlock and then unlock on correct PIN', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)          // pin_is_enabled (mount)
      .mockResolvedValueOnce('secretpass'); // pin_unlock

    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.type(screen.getByLabelText(/^PIN$/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pin_unlock', { pin: '1234' });
    });
    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalledWith('secretpass');
    });
  });
});

describe('LockScreen — PIN submit: incorrect PIN', () => {
  beforeEach(() => {
    mockInvoke
      .mockResolvedValueOnce(true) // pin_is_enabled
      .mockRejectedValueOnce(new Error('Incorrect PIN'));
  });

  it('shows "Incorrect PIN." error on wrong PIN', async () => {
    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.type(screen.getByLabelText(/^PIN$/i), '9999');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Incorrect PIN/i);
    });
  });
});

describe('LockScreen — PIN submit: rate-limit lockout', () => {
  it('shows countdown banner when backend returns locked:{secs}', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('locked:30'));

    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.type(screen.getByLabelText(/^PIN$/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
      expect(screen.getByText(/30s/i)).toBeInTheDocument();
    });
    // PIN input should be disabled during lockout
    expect(screen.getByLabelText(/^PIN$/i)).toBeDisabled();
  });
});

describe('LockScreen — PIN submit: unexpected error', () => {
  it('shows generic error for non-lockout, non-PIN errors', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('Database error'));

    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.type(screen.getByLabelText(/^PIN$/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/an error occurred/i);
    });
  });
});

describe('LockScreen — PIN submit: 2FA required', () => {
  it('transitions to 2FA step when twoFactorStatus.enabled is true and verifyUserPassword passes', async () => {
    const { verifyUserPassword } = await import('../lib/services/journalService');
    vi.mocked(verifyUserPassword).mockResolvedValueOnce(true);

    const { get2FAStatus } = await import('../lib/services/twoFactorService');
    vi.mocked(get2FAStatus).mockResolvedValueOnce({
      enabled: true,
      method: 'totp',
      has_backup_codes: true,
    });

    mockInvoke
      .mockResolvedValueOnce(true)            // pin_is_enabled
      .mockResolvedValueOnce('secretpass');  // pin_unlock success

    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.type(screen.getByLabelText(/^PIN$/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByText(/complete two-factor authentication/i)).toBeInTheDocument();
    });
  });
});

describe('LockScreen — PIN submit: unlock() returns false', () => {
  it('shows "Failed to unlock" error when unlock() returns false after correct PIN', async () => {
    mockUnlock.mockResolvedValueOnce(false);

    mockInvoke
      .mockResolvedValueOnce(true)            // pin_is_enabled
      .mockResolvedValueOnce('secretpass');  // pin_unlock success

    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.type(screen.getByLabelText(/^PIN$/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to unlock/i);
    });
  });
});

describe('LockScreen — PIN lockout: countdown expiry re-enables input', () => {
  afterEach(() => vi.useRealTimers());

  it('re-enables PIN input after countdown reaches zero', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockInvoke
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('locked:2'));

    render(<LockScreen />);

    // Wait for PIN button with real-time ticking (shouldAdvanceTime: true)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument(),
      { timeout: 3000 }
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.type(screen.getByLabelText(/^PIN$/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/^PIN$/i)).toBeDisabled(),
      { timeout: 3000 }
    );

    // Advance past the 2s lockout
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() =>
      expect(screen.getByLabelText(/^PIN$/i)).not.toBeDisabled(),
      { timeout: 3000 }
    );
  }, 15000);
});

describe('LockScreen — password submit: paint-yield + unlock', () => {
  beforeEach(() => {
    // pin_is_enabled returns false on mount → stay on password step
    mockInvoke.mockResolvedValue(false);
    mockUnlock.mockResolvedValue(true);
  });

  it('shows "Verifying…" loading state then calls unlock on the password path', async () => {
    const { verifyUserPassword } = await import('../lib/services/journalService');
    vi.mocked(verifyUserPassword).mockResolvedValue(true);

    render(<LockScreen />);

    const input = await screen.findByLabelText(/^password$/i);
    await userEvent.type(input, 'correct horse');

    const submit = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submit);

    // nextPaint() yields a painted frame before verify; the button flips to the
    // loading state. Assert the "Verifying…" label appears.
    await waitFor(() => {
      expect(screen.getByText(/verifying/i)).toBeInTheDocument();
    });

    // The verify round-trip runs, then unlock() is called with the password.
    await waitFor(() => {
      expect(verifyUserPassword).toHaveBeenCalledWith('correct horse');
    });
    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalledWith('correct horse');
    });
  });

  it('does not call unlock and surfaces an error on an incorrect password', async () => {
    const { verifyUserPassword } = await import('../lib/services/journalService');
    vi.mocked(verifyUserPassword).mockResolvedValueOnce(false);

    render(<LockScreen />);

    const input = await screen.findByLabelText(/^password$/i);
    await userEvent.type(input, 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(verifyUserPassword).toHaveBeenCalledWith('wrongpass');
    });
    expect(mockUnlock).not.toHaveBeenCalled();
  });
});

describe('LockScreen — recovery key: corrupted escrow guard', () => {
  it('rejects a recovered password that does not match the stored hash (with 2FA enabled)', async () => {
    const { recoverPassword, isRecoveryKeyEnabled } = await import(
      '../lib/services/recoveryKeyService'
    );
    vi.mocked(isRecoveryKeyEnabled).mockResolvedValueOnce(true);
    vi.mocked(recoverPassword).mockResolvedValueOnce('wrong-decrypted-password');

    const { verifyUserPassword } = await import('../lib/services/journalService');
    // Escrow decrypts cleanly but yields a password that fails hash verification.
    vi.mocked(verifyUserPassword).mockResolvedValueOnce(false);

    // 2FA enabled — without the guard this path would promote via finalizeUnlock (no verify).
    const { get2FAStatus } = await import('../lib/services/twoFactorService');
    vi.mocked(get2FAStatus).mockResolvedValue({
      enabled: true,
      method: 'totp',
      has_backup_codes: true,
    });

    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use recovery key/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use recovery key/i }));
    await userEvent.type(
      screen.getByLabelText(/recovery key/i),
      'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'
    );
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByText(/escrow corrupted/i)).toBeInTheDocument();
    });
    // Must NOT advance to the 2FA step or promote the session.
    expect(screen.queryByText(/enter recovery key/i)).toBeInTheDocument();
    expect(mockFinalizeUnlock).not.toHaveBeenCalled();
    expect(mockUnlock).not.toHaveBeenCalled();
  });
});

describe('LockScreen — PIN submit: stale password', () => {
  it('shows stale-password error when PIN decrypts but verifyUserPassword fails', async () => {
    const { verifyUserPassword } = await import('../lib/services/journalService');
    vi.mocked(verifyUserPassword).mockResolvedValueOnce(false);

    const { get2FAStatus } = await import('../lib/services/twoFactorService');
    vi.mocked(get2FAStatus).mockResolvedValueOnce({
      enabled: true,
      method: 'totp',
      has_backup_codes: true,
    });

    mockInvoke
      .mockResolvedValueOnce(true)           // pin_is_enabled
      .mockResolvedValueOnce('secretpass'); // pin_unlock success

    render(<LockScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use pin/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /use pin/i }));
    await userEvent.type(screen.getByLabelText(/^PIN$/i), '1234');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/password is no longer valid/i);
    });
  });
});
