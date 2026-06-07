import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShowCodeTab } from './PairingShowCodeTab';

// Mock the pairing IPC service so the tab can mount without a backend.
vi.mock('../../lib/services/peerPairingService', () => ({
  generatePairingToken: vi.fn(),
  cancelPairing: vi.fn().mockResolvedValue(undefined),
  onPeerPaired: vi.fn().mockResolvedValue(() => {}),
  onPairingAttemptFailed: vi.fn().mockResolvedValue(() => {}),
  onPairingLocked: vi.fn().mockResolvedValue(() => {}),
}));

import { generatePairingToken } from '../../lib/services/peerPairingService';

const mockGenerate = vi.mocked(generatePairingToken);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ShowCodeTab QR rendering', () => {
  it('renders the QR code (svg) once a token with a qrPayload is loaded', async () => {
    mockGenerate.mockResolvedValue({
      pin: '123456',
      qrPayload: '{"host":"192.168.1.10","port":43611,"deviceId":"abc123","pin":"123456"}',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      localHost: '192.168.1.10',
      pairingPort: 43611,
    });

    render(<ShowCodeTab onSuccess={() => {}} />);

    // The QR must actually render — regression guard for the broken
    // dynamic-import('qrcode') path that left a perpetual spinner. The title
    // only exists inside the rendered <svg>, so finding it proves the QR drew.
    const qrTitle = await screen.findByTitle('Pairing QR code');
    expect(qrTitle.closest('svg')).not.toBeNull();
  });

  it('shows the loading spinner (no QR) while the token is still resolving', () => {
    // Never resolves — the tab stays on the "Starting pairing server…" state.
    mockGenerate.mockReturnValue(new Promise(() => {}));
    render(<ShowCodeTab onSuccess={() => {}} />);
    expect(screen.getByText(/Starting pairing server/i)).toBeInTheDocument();
    expect(screen.queryByTitle('Pairing QR code')).not.toBeInTheDocument();
  });
});
