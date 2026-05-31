import { useState, useEffect, useCallback } from 'react';
import type { DiscoveredPeer, TrustedDevice } from '../../types/peerSync';
import { acceptPairing } from '../../lib/services/peerPairingService';
import { PINInput } from './PairingUIComponents';

export function EnterCodeTab({
  peer,
  onSuccess,
}: {
  peer: DiscoveredPeer;
  onSuccess: (device: TrustedDevice) => void;
}) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockedOut, setLockedOut] = useState(false);

  const handlePinChange = useCallback((v: string) => {
    setPin(v);
    // Clear error feedback as the user starts typing a new code
    if (error) setError('');
  }, [error]);

  const handleSubmit = useCallback(async () => {
    if (pin.length !== 6 || lockedOut) return;
    setLoading(true);
    setError('');
    try {
      const device = await acceptPairing(peer.host, peer.deviceId, pin);
      onSuccess(device);
    } catch (e) {
      const msg = String(e);
      // Detect session lockout (HTTP 429 from the other device's server)
      if (msg.toLowerCase().includes('locked') || msg.toLowerCase().includes('too many')) {
        setLockedOut(true);
      } else {
        setError('Incorrect PIN — please try again');
      }
      // Always clear so the user has to retype (prevents auto-resubmit loop)
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [pin, peer.host, peer.deviceId, onSuccess, lockedOut]);

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (pin.length === 6 && !loading && !lockedOut) {
      handleSubmit();
    }
  }, [pin, loading, lockedOut, handleSubmit]);

  if (lockedOut) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            Too many incorrect attempts
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ask <strong>{peer.deviceName}</strong> to generate a new pairing code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
        On <strong>{peer.deviceName}</strong>, go to{' '}
        <strong>Settings → Devices → Pair → Show My Code</strong> and enter the 6-digit code shown:
      </p>

      <PINInput
        value={pin}
        onChange={handlePinChange}
        disabled={loading}
        hasError={!!error}
      />

      {/* Error feedback */}
      {error && (
        <div className="flex items-center justify-center gap-1.5" role="alert">
          <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={pin.length !== 6 || loading}
        className="w-full py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Pairing…
          </>
        ) : (
          'Pair Device'
        )}
      </button>

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        Connecting to {peer.host} (pairing server)
      </p>
    </div>
  );
}
