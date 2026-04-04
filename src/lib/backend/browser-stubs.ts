/**
 * Browser stubs for Tauri-only plugins.
 *
 * Aliased in vite.config.ts when VITE_TARGET=web so multiple packages
 * all resolve to this one file. Exports the minimal surface needed to
 * satisfy TypeScript and avoid runtime errors on module load.
 *
 * Callers guard with usePlatform().isBrowser before calling anything that
 * actually needs these — so the stubs only need to not throw on import.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// plugin-http: replaced by http.ts conditional fetch; this re-export is a safety net
export const fetch = window.fetch.bind(window);

// plugin-log
export const trace = (_msg: string, ..._args: any[]) => {};
export const debug = (_msg: string, ..._args: any[]) => {};
export const info = (_msg: string, ..._args: any[]) => {};
export const warn = (_msg: string, ..._args: any[]) => {};
export const error = (_msg: string, ..._args: any[]) => {};
export const attachConsole = async () => () => {};

// plugin-shell
export const open = async (url: string) => { window.open(url, '_blank'); };
export class Command {
  static create() { return new Command(); }
  async execute() { return { stdout: '', stderr: '', code: 0 }; }
}

// plugin-dialog (no-ops; open/save need different names to avoid collision)
export const dialogOpen = async () => null;
export const save = async () => null;

// plugin-notification
export const sendNotification = (_opts: any) => {};
export const isPermissionGranted = async () => false;
export const requestPermission = async () => 'denied' as const;

// api/window
export const getCurrentWindow = () => ({
  setFullscreen: async (_v: boolean) => {},
  isFullscreen: async () => false,
  minimize: async () => {},
  close: async () => { window.close(); },
  onCloseRequested: async (_h: any) => () => {},
  setTitle: async (_t: string) => {},
});
export const appWindow = getCurrentWindow();

// api/event
export const listen = async (_event: string, _handler: any) => () => {};
export const emit = async (_event: string, _payload?: any) => {};
export const once = async (_event: string, _handler: any) => () => {};
