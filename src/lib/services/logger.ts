import { debug, info, warn, error } from '@tauri-apps/plugin-log';

export type LogContext = Record<string, string | number | boolean>;
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LogModule = 'sync' | 'ai' | 'stt' | 'peer' | 'crypto' | 'db';

const MAX_MSG_LENGTH = 2000;
const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
let _level: LogLevel = 'warn';
const _moduleLevels: Partial<Record<LogModule, LogLevel>> = {};

export function setLevel(level: LogLevel): void {
  _level = level;
}

export function setModuleLevel(module: LogModule, level: LogLevel | null): void {
  if (level === null) {
    delete _moduleLevels[module];
  } else {
    _moduleLevels[module] = level;
  }
}

function allowed(msgLevel: LogLevel, module?: LogModule): boolean {
  const effective = module !== undefined && _moduleLevels[module] !== undefined
    ? _moduleLevels[module]!
    : _level;
  return ORDER[msgLevel] <= ORDER[effective];
}

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
    if (!allowed('debug')) return;
    void debug(format(msg, ctx));
  },
  info(msg: string, ctx?: LogContext): void {
    if (!allowed('info')) return;
    void info(format(msg, ctx));
  },
  warn(msg: string, ctx?: LogContext): void {
    if (!allowed('warn')) return;
    void warn(format(msg, ctx));
  },
  error(msg: string, ctx?: LogContext): void {
    if (!allowed('error')) return;
    void error(format(msg, ctx));
  },
};

export function forModule(module: LogModule): typeof logger {
  return {
    debug(msg: string, ctx?: LogContext): void {
      if (!allowed('debug', module)) return;
      void debug(format(msg, ctx));
    },
    info(msg: string, ctx?: LogContext): void {
      if (!allowed('info', module)) return;
      void info(format(msg, ctx));
    },
    warn(msg: string, ctx?: LogContext): void {
      if (!allowed('warn', module)) return;
      void warn(format(msg, ctx));
    },
    error(msg: string, ctx?: LogContext): void {
      if (!allowed('error', module)) return;
      void error(format(msg, ctx));
    },
  };
}
