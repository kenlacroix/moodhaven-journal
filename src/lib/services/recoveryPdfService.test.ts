import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { buildRecoveryPdf, exportRecoveryPdf } from './recoveryPdfService';

const mockInvoke = vi.mocked(invoke);
const mockSave = vi.mocked(save);

const KEY = 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ';

function pdfHeader(buf: ArrayBuffer): string {
  return String.fromCharCode(...new Uint8Array(buf).subarray(0, 5));
}

describe('buildRecoveryPdf', () => {
  it('produces a valid PDF document', () => {
    const doc = buildRecoveryPdf(KEY, new Date('2026-06-08T00:00:00Z'));
    const buf = doc.output('arraybuffer');
    expect(pdfHeader(buf)).toBe('%PDF-');
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it('is deterministic for the same key and date', () => {
    const a = buildRecoveryPdf(KEY, new Date('2026-06-08T00:00:00Z')).output('arraybuffer');
    const b = buildRecoveryPdf(KEY, new Date('2026-06-08T00:00:00Z')).output('arraybuffer');
    expect(a.byteLength).toBe(b.byteLength);
  });
});

describe('exportRecoveryPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the PDF bytes via write_binary_file as base64', async () => {
    mockSave.mockResolvedValue('/tmp/moodhaven-recovery-key.pdf');
    mockInvoke.mockResolvedValue(undefined);

    const result = await exportRecoveryPdf(KEY);

    expect(result).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith(
      'write_binary_file',
      expect.objectContaining({
        path: '/tmp/moodhaven-recovery-key.pdf',
        contentsBase64: expect.any(String),
      })
    );
    const [, params] = mockInvoke.mock.calls[0];
    // Base64 of a PDF decodes back to the %PDF header.
    const decoded = atob((params as { contentsBase64: string }).contentsBase64);
    expect(decoded.slice(0, 5)).toBe('%PDF-');
  });

  it('returns false and writes nothing when the save dialog is cancelled', async () => {
    mockSave.mockResolvedValue(null);

    const result = await exportRecoveryPdf(KEY);

    expect(result).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
