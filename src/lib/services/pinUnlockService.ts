import { invoke } from '@tauri-apps/api/core';

export async function pinIsEnabled(): Promise<boolean> {
  return invoke('pin_is_enabled');
}

export async function pinSetup(password: string, pin: string): Promise<void> {
  return invoke('pin_setup', { password, pin });
}

/** Returns the decrypted master password on success.
 *  Throws with message `"locked:{secs}"` when rate-limited.
 *  Throws with `"Incorrect PIN"` on wrong PIN. */
export async function pinUnlock(pin: string): Promise<string> {
  return invoke('pin_unlock', { pin });
}

export async function pinDisable(): Promise<void> {
  return invoke('pin_disable');
}
