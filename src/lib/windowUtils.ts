import { getCurrentWindow } from '@tauri-apps/api/window';

/** Toggle the application window between normal and fullscreen. */
export async function toggleFullscreen(): Promise<void> {
  const win = getCurrentWindow();
  const isFullscreen = await win.isFullscreen();
  await win.setFullscreen(!isFullscreen);
}
