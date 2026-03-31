import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

/** Toggle the application window between normal and fullscreen. */
export async function toggleFullscreen(): Promise<void> {
  const win = getCurrentWindow();
  const isFullscreen = await win.isFullscreen();
  await win.setFullscreen(!isFullscreen);
}

/** Open (or focus) the standalone breakout writer window.
 *
 * Deposits the current session password into the Rust-side one-shot session
 * bridge before creating the window. The breakout window retrieves and clears
 * it on init so the user doesn't have to re-enter their password.
 */
export async function openBreakoutWriter(): Promise<void> {
  const { getSessionPassword } = await import('./journalService');
  const pw = getSessionPassword();
  if (pw) {
    await invoke('store_session_password', { password: pw });
  }
  await invoke('open_writer_window');
}
