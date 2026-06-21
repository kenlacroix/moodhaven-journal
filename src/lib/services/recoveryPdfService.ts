/**
 * Recovery Key PDF Service
 *
 * Builds a single-page, print-ready "Emergency Kit" style PDF that contains the
 * user's recovery key plus instructions for using it. The PDF is generated
 * entirely client-side (jsPDF) — the recovery key never leaves the frontend, and
 * the file is only ever written to a path the user explicitly picks.
 *
 * On desktop the bytes are written via the guarded `write_binary_file` Tauri
 * command (same path guard as `write_text_file`). In browser/PWA mode the shim
 * triggers a normal download.
 */

import { jsPDF } from 'jspdf';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { isAndroidPlatform } from '../../hooks/usePlatform';
import { shareExportedBinary } from './mobileExport';

const IS_BROWSER = typeof window !== 'undefined' && !window.__TAURI_INTERNALS__;
const DEFAULT_FILE_NAME = 'moodhaven-recovery-key.pdf';

// Brand palette (RGB) — matches the design tokens in CLAUDE.md / Tailwind config.
const VIOLET = [124, 58, 237] as const; // violet-600
const VIOLET_50 = [245, 243, 255] as const;
const VIOLET_200 = [221, 214, 254] as const;
const SLATE_800 = [30, 41, 59] as const;
const SLATE_600 = [71, 85, 105] as const;
const SLATE_500 = [100, 116, 139] as const;
const SLATE_200 = [226, 232, 240] as const;
const WHITE = [255, 255, 255] as const;
const AMBER_50 = [255, 251, 235] as const;
const AMBER_300 = [252, 211, 77] as const;
const AMBER_800 = [146, 64, 14] as const;

type RGB = readonly [number, number, number];

const HOW_TO_STEPS = [
  'Open MoodHaven Journal. At the lock screen, choose "Use recovery key" instead of typing your password.',
  'Enter the 24-character key above exactly as shown. Dashes are optional; letters are not case-sensitive.',
  'If you use two-factor authentication, complete that step as usual.',
  'Your journal unlocks. If you forgot your password, set a new one afterward in Settings under Privacy.',
];

const WARNINGS = [
  'Anyone who has this key can open your journal. Store it offline — a safe, a locked drawer, or a password manager.',
  'MoodHaven cannot recover your data for you. There is no master key, admin password, or cloud backup.',
  'If you lose both your password and this key, your entries cannot be recovered by anyone.',
];

function setFill(doc: jsPDF, c: RGB): void {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setText(doc: jsPDF, c: RGB): void {
  doc.setTextColor(c[0], c[1], c[2]);
}
function setStroke(doc: jsPDF, c: RGB): void {
  doc.setDrawColor(c[0], c[1], c[2]);
}

/** Draw a small key glyph (white, for the violet header). Center at (cx, cy). */
function drawKeyIcon(doc: jsPDF, cx: number, cy: number): void {
  setFill(doc, WHITE);
  setStroke(doc, WHITE);
  doc.circle(cx, cy, 4.2, 'F'); // bow
  setFill(doc, VIOLET);
  doc.circle(cx, cy, 1.8, 'F'); // keyhole
  setFill(doc, WHITE);
  doc.rect(cx + 3.2, cy - 1.1, 12, 2.2, 'F'); // shaft
  doc.rect(cx + 12.5, cy + 1.1, 1.8, 2.6, 'F'); // tooth 1
  doc.rect(cx + 9.5, cy + 1.1, 1.8, 2.6, 'F'); // tooth 2
}

/**
 * Build the recovery-key PDF document. Exported for testing.
 */
export function buildRecoveryPdf(recoveryKey: string, generatedAt: Date = new Date()): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;
  const centerX = pageW / 2;

  // --- Header band ---------------------------------------------------------
  setFill(doc, VIOLET);
  doc.rect(0, 0, pageW, 34, 'F');
  drawKeyIcon(doc, margin + 4, 17);
  setText(doc, WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('MoodHaven Journal', margin + 22, 15);
  setText(doc, VIOLET_200);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Recovery Key — keep this somewhere safe', margin + 22, 24);

  // --- Intro ---------------------------------------------------------------
  let y = 46;
  setText(doc, SLATE_600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const intro =
    'This sheet lets you regain access to your journal if you ever forget your password. ' +
    'Your journal stays encrypted on your device — this key is the only built-in way back in.';
  for (const line of doc.splitTextToSize(intro, contentW)) {
    doc.text(line, margin, y);
    y += 5.4;
  }

  // --- Key box -------------------------------------------------------------
  y += 4;
  const boxH = 30;
  setFill(doc, VIOLET_50);
  setStroke(doc, VIOLET_200);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentW, boxH, 3, 3, 'FD');
  setText(doc, VIOLET);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setCharSpace(1.2);
  doc.text('YOUR RECOVERY KEY', centerX, y + 9, { align: 'center' });
  setText(doc, SLATE_800);
  doc.setFont('courier', 'bold');
  doc.setFontSize(20);
  doc.setCharSpace(1.4);
  doc.text(recoveryKey, centerX, y + 21, { align: 'center' });
  doc.setCharSpace(0);
  y += boxH + 12;

  // --- How to use ----------------------------------------------------------
  setText(doc, SLATE_800);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('How to use this key', margin, y);
  y += 8;
  doc.setFontSize(10);
  HOW_TO_STEPS.forEach((step, i) => {
    setFill(doc, VIOLET);
    doc.circle(margin + 2.6, y - 1.4, 2.8, 'F');
    setText(doc, WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(String(i + 1), margin + 2.6, y - 0.2, { align: 'center' });
    setText(doc, SLATE_600);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(step, contentW - 10);
    doc.text(lines, margin + 8, y);
    y += Math.max(lines.length * 5, 6) + 3;
  });

  // --- Warning box ---------------------------------------------------------
  y += 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  let warnH = 12;
  const wrappedWarnings = WARNINGS.map((w) => doc.splitTextToSize(w, contentW - 14));
  for (const lines of wrappedWarnings) warnH += lines.length * 4.6 + 1.5;
  setFill(doc, AMBER_50);
  setStroke(doc, AMBER_300);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentW, warnH, 3, 3, 'FD');
  setText(doc, AMBER_800);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Important', margin + 6, y + 8);
  let wy = y + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  for (const lines of wrappedWarnings) {
    doc.text('•', margin + 6, wy);
    doc.text(lines, margin + 10, wy);
    wy += lines.length * 4.6 + 1.5;
  }
  y += warnH + 12;

  // --- Where stored (user fills in) ---------------------------------------
  setText(doc, SLATE_600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Kept safe at:', margin, y);
  setStroke(doc, SLATE_200);
  doc.setLineWidth(0.3);
  doc.line(margin + 26, y + 1, margin + contentW, y + 1);

  // --- Footer --------------------------------------------------------------
  const footerY = 270;
  setStroke(doc, SLATE_200);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageW - margin, footerY);
  setText(doc, SLATE_500);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const dateStr = generatedAt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(
    `Generated ${dateStr} · Created on your device. This sheet was never uploaded anywhere.`,
    centerX,
    footerY + 5,
    { align: 'center' }
  );

  return doc;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Generate the recovery-key PDF and write it to disk.
 *
 * @returns true if a file was written, false if the user cancelled the save dialog.
 */
export async function exportRecoveryPdf(
  recoveryKey: string,
  fileName: string = DEFAULT_FILE_NAME
): Promise<boolean> {
  const doc = buildRecoveryPdf(recoveryKey);
  const base64 = bytesToBase64(new Uint8Array(doc.output('arraybuffer')));

  if (IS_BROWSER) {
    await invoke('write_binary_file', { path: fileName, contentsBase64: base64 });
    return true;
  }

  if (isAndroidPlatform) {
    await shareExportedBinary(fileName, base64, 'application/pdf');
    return true;
  }

  const filePath = await save({
    defaultPath: fileName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!filePath) return false;

  await invoke('write_binary_file', { path: filePath, contentsBase64: base64 });
  return true;
}
