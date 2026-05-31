import { debug, info, warn, error } from '@tauri-apps/plugin-log';
import { logger, setLevel, setModuleLevel, forModule } from './logger';

const mockDebug = vi.mocked(debug);
const mockInfo = vi.mocked(info);
const mockWarn = vi.mocked(warn);
const mockError = vi.mocked(error);

beforeEach(() => { vi.clearAllMocks(); setLevel('debug'); setModuleLevel('sync', null); });
afterEach(() => { setLevel('warn'); setModuleLevel('sync', null); });

describe('logger', () => {
  it('info calls plugin info with msg', () => {
    logger.info('test message');
    expect(mockInfo).toHaveBeenCalledWith('test message');
  });

  it('info with context formats as "msg | k=v"', () => {
    logger.info('sync done', { sent: 5, received: 3 });
    expect(mockInfo).toHaveBeenCalledWith('sync done | sent=5 received=3');
  });

  it('context round-trip: sent=5 appears in output', () => {
    logger.info('msg', { sent: 5 });
    expect(mockInfo).toHaveBeenCalledWith('msg | sent=5');
  });

  it('truncates message at 2000 chars', () => {
    const longMsg = 'x'.repeat(2500);
    logger.info(longMsg);
    const called = mockInfo.mock.calls[0][0] as string;
    expect(called.length).toBe(2000);
  });

  it('handles empty string without throwing', () => {
    expect(() => logger.info('')).not.toThrow();
  });

  it('debug calls plugin debug', () => {
    logger.debug('debug msg');
    expect(mockDebug).toHaveBeenCalledWith('debug msg');
  });

  it('warn calls plugin warn', () => {
    logger.warn('warn msg');
    expect(mockWarn).toHaveBeenCalledWith('warn msg');
  });

  it('error calls plugin error', () => {
    logger.error('error msg');
    expect(mockError).toHaveBeenCalledWith('error msg');
  });

  it('debug with context serializes correctly', () => {
    logger.debug('[sync] connecting', { peer: 'abc123', port: 44001 });
    expect(mockDebug).toHaveBeenCalledWith('[sync] connecting | peer=abc123 port=44001');
  });

  it('no context: no pipe appended', () => {
    logger.warn('no ctx');
    expect(mockWarn).toHaveBeenCalledWith('no ctx');
  });
});

describe('setLevel', () => {
  it('warn level: debug and info are suppressed, warn and error call through', () => {
    setLevel('warn');
    logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
    expect(mockDebug).not.toHaveBeenCalled();
    expect(mockInfo).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith('w');
    expect(mockError).toHaveBeenCalledWith('e');
  });

  it('error level: only error calls through', () => {
    setLevel('error');
    logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
    expect(mockDebug).not.toHaveBeenCalled();
    expect(mockInfo).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledWith('e');
  });

  it('info level: debug suppressed, info/warn/error call through', () => {
    setLevel('info');
    logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
    expect(mockDebug).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith('i');
    expect(mockWarn).toHaveBeenCalledWith('w');
    expect(mockError).toHaveBeenCalledWith('e');
  });

  it('debug level: all four call through', () => {
    setLevel('debug');
    logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
    expect(mockDebug).toHaveBeenCalledWith('d');
    expect(mockInfo).toHaveBeenCalledWith('i');
    expect(mockWarn).toHaveBeenCalledWith('w');
    expect(mockError).toHaveBeenCalledWith('e');
  });

  it('error always calls through regardless of level', () => {
    setLevel('error');
    logger.error('always');
    expect(mockError).toHaveBeenCalledWith('always');
  });
});

describe('forModule', () => {
  it('uses module-level override when set', () => {
    setLevel('warn');
    setModuleLevel('sync', 'debug');
    const syncLog = forModule('sync');
    syncLog.debug('sync detail');
    expect(mockDebug).toHaveBeenCalledWith('sync detail');
  });

  it('falls back to global level when no override set', () => {
    setLevel('warn');
    const syncLog = forModule('sync');
    syncLog.debug('should be suppressed');
    syncLog.warn('should pass');
    expect(mockDebug).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith('should pass');
  });

  it('setModuleLevel(mod, null) clears the override and falls back to global', () => {
    setLevel('warn');
    setModuleLevel('sync', 'debug');
    setModuleLevel('sync', null);
    const syncLog = forModule('sync');
    syncLog.debug('cleared');
    expect(mockDebug).not.toHaveBeenCalled();
  });

  it('module override does not affect other modules', () => {
    setLevel('warn');
    setModuleLevel('sync', 'debug');
    const aiLog = forModule('ai');
    aiLog.debug('ai suppressed');
    expect(mockDebug).not.toHaveBeenCalled();
  });

  it('module override does not affect the global logger', () => {
    setLevel('warn');
    setModuleLevel('sync', 'debug');
    logger.debug('global suppressed');
    expect(mockDebug).not.toHaveBeenCalled();
  });

  it('module override at error level suppresses warn', () => {
    setLevel('debug');
    setModuleLevel('peer', 'error');
    const peerLog = forModule('peer');
    peerLog.warn('peer warn suppressed');
    peerLog.error('peer error passes');
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledWith('peer error passes');
  });

  it('forModule passes context formatting through', () => {
    setModuleLevel('stt', 'debug');
    const sttLog = forModule('stt');
    sttLog.info('transcribed', { words: 42 });
    expect(mockInfo).toHaveBeenCalledWith('transcribed | words=42');
  });
});
