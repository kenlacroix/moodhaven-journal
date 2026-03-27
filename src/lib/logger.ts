import { debug, info, warn, error } from '@tauri-apps/plugin-log';

export type LogContext = Record<string, string | number | boolean>;

const MAX_MSG_LENGTH = 2000;

function format(msg: string, ctx?: LogContext): string {
  const out = msg.length > MAX_MSG_LENGTH ? msg.slice(0, MAX_MSG_LENGTH) : msg;
  if (ctx && Object.keys(ctx).length > 0) {
    const pairs = Object.entries(ctx)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    return `${out} | ${pairs}`;
  }
  return out;
}

export const logger = {
  debug(msg: string, ctx?: LogContext): void {
    void debug(format(msg, ctx));
  },
  info(msg: string, ctx?: LogContext): void {
    void info(format(msg, ctx));
  },
  warn(msg: string, ctx?: LogContext): void {
    void warn(format(msg, ctx));
  },
  error(msg: string, ctx?: LogContext): void {
    void error(format(msg, ctx));
  },
};
