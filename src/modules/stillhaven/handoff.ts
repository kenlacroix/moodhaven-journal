import type { ViewType } from '../../components/layout/Sidebar';
import type { StillSession, StillActivationSample } from '../../lib/stillService';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function protocolLabel(protocol: string): string {
  switch (protocol) {
    case 'general_activation': return 'general grounding';
    case 'fake_danger': return 'fake danger reset';
    default: return protocol.replace(/_/g, ' ');
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0
    ? `${m} minute${m !== 1 ? 's' : ''}${s > 0 ? ` ${s}s` : ''}`
    : `${s} seconds`;
}

export function renderSessionTemplate(
  session: StillSession,
  preSample: StillActivationSample,
  postSample: StillActivationSample,
): string {
  const delta = preSample.activation - postSample.activation;
  const deltaStr =
    delta > 0
      ? `down ${delta}`
      : delta < 0
      ? `up ${Math.abs(delta)}`
      : 'unchanged';

  const hrvLine =
    postSample.hrv_manual !== null
      ? `<p><strong>HRV:</strong> ${postSample.hrv_manual} ms (manual)</p>`
      : preSample.hrv_manual !== null
      ? `<p><strong>HRV (pre):</strong> ${preSample.hrv_manual} ms</p>`
      : '';

  const noteLine =
    postSample.note
      ? `<p><em>${escapeHtml(postSample.note)}</em></p>`
      : '';

  return [
    `<span data-still-session-id="${session.id}" style="display:none"></span>`,
    `<h3>StillHaven — ${formatDuration(session.duration_seconds)}, ${protocolLabel(session.protocol)}</h3>`,
    `<p><strong>Activation:</strong> ${preSample.activation} → ${postSample.activation} (${deltaStr})</p>`,
    hrvLine,
    `<p><strong>What shifted, if anything?</strong></p>`,
    noteLine || `<p></p>`,
    `<p></p>`,
  ].filter(Boolean).join('\n');
}

export function handoffToJournal(args: {
  setCurrentView: (v: ViewType) => void;
  setPendingHandoffHtml: (html: string) => void;
  bumpWritingKey: () => void;
  session: StillSession;
  preSample: StillActivationSample;
  postSample: StillActivationSample;
}): void {
  const html = renderSessionTemplate(args.session, args.preSample, args.postSample);
  args.setPendingHandoffHtml(html);
  args.bumpWritingKey();
  args.setCurrentView('writing');
}
