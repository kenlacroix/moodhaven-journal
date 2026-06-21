import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(async () => '/data/app'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}));

import { shareExportedText, shareExportedBinary } from './mobileExport';

const mockInvoke = vi.mocked(invoke);

describe('mobileExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('writes a text export to app storage then opens the share sheet', async () => {
    await shareExportedText('codes.txt', 'hello', 'text/plain');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'write_text_file', {
      path: '/data/app/codes.txt',
      contents: 'hello',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'plugin:opener|shareFile', {
      path: '/data/app/codes.txt',
      mimeType: 'text/plain',
    });
  });

  it('writes a binary export to app storage then opens the share sheet', async () => {
    await shareExportedBinary('key.pdf', 'YmFzZTY0', 'application/pdf');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'write_binary_file', {
      path: '/data/app/key.pdf',
      contentsBase64: 'YmFzZTY0',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'plugin:opener|shareFile', {
      path: '/data/app/key.pdf',
      mimeType: 'application/pdf',
    });
  });
});
