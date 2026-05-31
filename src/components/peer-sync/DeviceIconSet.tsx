// ── Device type icon ──────────────────────────────────────────────────────────

export function DeviceIcon({ type, className = 'w-5 h-5' }: { type: string; className?: string }) {
  if (type === 'phone')
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  if (type === 'tablet')
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="4" y="2" width="16" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  if (type === 'watch')
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="7" y="6" width="10" height="12" rx="3" strokeLinecap="round" strokeLinejoin="round" />
        <path strokeLinecap="round" d="M9 6V4h6v2M9 18v2h6v-2" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="2" y="3" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" />
    </svg>
  );
}

// ── Signal strength indicator ─────────────────────────────────────────────────

export function SignalBars({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-px ${className}`} aria-label="Strong signal" title="Strong signal">
      {[4, 7, 10].map((h, i) => (
        <span key={i} className="w-1 rounded-sm bg-emerald-400" style={{ height: h }} />
      ))}
    </span>
  );
}

// ── Scanning dots ─────────────────────────────────────────────────────────────

export function ScanningDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}
