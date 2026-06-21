/**
 * Mobile export fallback.
 *
 * Android has no save dialog (the desktop `save()` flow returns nothing usable),
 * so an export is written to app-private storage and then handed to the system
 * share sheet via the native OpenerPlugin's `shareFile` ACTION_SEND chooser. The
 * user picks the destination (Drive, Files, email, …) from there.
 */
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';

async function exportPath(fileName: string): Promise<string> {
  return join(await appDataDir(), fileName);
}

/** Write a text export to app storage and open the share sheet. */
export async function shareExportedText(
  fileName: string,
  contents: string,
  mimeType: string
): Promise<void> {
  const path = await exportPath(fileName);
  await invoke<number>('write_text_file', { path, contents });
  await invoke('plugin:opener|shareFile', { path, mimeType });
}

/** Write a base64 binary export to app storage and open the share sheet. */
export async function shareExportedBinary(
  fileName: string,
  contentsBase64: string,
  mimeType: string
): Promise<void> {
  const path = await exportPath(fileName);
  await invoke<number>('write_binary_file', { path, contentsBase64 });
  await invoke('plugin:opener|shareFile', { path, mimeType });
}
