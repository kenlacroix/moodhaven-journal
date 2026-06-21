import { describe, it, expect } from 'vitest';
import { isAndroidPlatform } from './usePlatform';

describe('usePlatform exports', () => {
  it('exposes isAndroidPlatform — false under jsdom (no Tauri internals)', () => {
    expect(isAndroidPlatform).toBe(false);
  });
});
