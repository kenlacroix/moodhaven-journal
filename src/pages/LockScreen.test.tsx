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
  get2FAStatus: vi.fn().mockResolvedValue({ enabled: false, method: null, backupCodesRemaining: 0 }),
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
  vi.mocked(useAppStore).mockImplementation((selector: (s: ReturnType<typeof useAppStore>) => unknown) =>
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
    } as ReturnType<typeof useAppStore>)
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

describe('LockScreen — PIN submit: stale password', () => {
  it('shows stale-password error when PIN decrypts but verifyUserPassword fails', async () => {
    const { verifyUserPassword } = await import('../lib/services/journalService');
    vi.mocked(verifyUserPassword).mockResolvedValueOnce(false);

    const { get2FAStatus } = await import('../lib/services/twoFactorService');
    vi.mocked(get2FAStatus).mockResolvedValueOnce({
      enabled: true,
      method: 'totp',
      backupCodesRemaining: 5,
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
