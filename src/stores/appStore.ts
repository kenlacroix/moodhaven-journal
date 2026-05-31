/**
 * App Store
 *
 * Global application state using Zustand.
 * Handles authentication state and app settings.
 */

import { create } from 'zustand';
import { logger } from '../lib/services/logger';
import {
  hasPassword,
  setupPassword,
  unlockJournal,
  lockJournal,
  devBypassUnlock,
} from '../lib/services/journalService';
import { seedDevEntries } from '../lib/devSeed';

interface AppState {
  // Authentication
  isInitialized: boolean;
  isUnlocked: boolean;
  /** Session password cached in-memory after unlock for auto-sync. Never persisted. */
  sessionPassword: string | null;

  // Theme
  theme: 'light' | 'dark' | 'system';

  // Actions
  checkInitialization: () => Promise<void>;
  initialize: (password: string) => Promise<boolean>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  isInitialized: false,
  isUnlocked: false,
  sessionPassword: null,
  theme: 'system',

  // Check if user has set up password
  checkInitialization: async () => {
    if (import.meta.env.DEV && (import.meta.env.VITE_DEV_MODE === 'bypass' || import.meta.env.VITE_DEV_MODE === 'seeded')) {
      devBypassUnlock('dev-bypass');
      set({ isInitialized: true, isUnlocked: true, sessionPassword: 'dev-bypass' });
      if (import.meta.env.VITE_DEV_MODE === 'seeded') {
        seedDevEntries().catch(() => {/* non-fatal */});
      }
      return;
    }
    try {
      const initialized = await hasPassword();
      set({ isInitialized: initialized });
    } catch (error) {
      logger.error('Failed to check initialization:', { error: String(error) });
      set({ isInitialized: false });
    }
  },

  // First-time setup with password
  initialize: async (password: string) => {
    try {
      await setupPassword(password);
      // Auto-unlock after setup
      const unlocked = await unlockJournal(password);
      set({ isInitialized: true, isUnlocked: unlocked, sessionPassword: unlocked ? password : null });
      return true;
    } catch (error) {
      logger.error('Failed to initialize:', { error: String(error) });
      return false;
    }
  },

  // Unlock with password
  unlock: async (password: string) => {
    try {
      const success = await unlockJournal(password);
      if (success) {
        set({ isUnlocked: true, sessionPassword: password });
      }
      return success;
    } catch (error) {
      logger.error('Failed to unlock:', { error: String(error) });
      return false;
    }
  },

  // Lock the journal
  lock: () => {
    lockJournal();
    set({ isUnlocked: false, sessionPassword: null });
  },

  // Set theme
  setTheme: (theme) => {
    set({ theme });

    // Apply theme to document
    const root = document.documentElement;
    if (theme === 'system') {
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }

    // Persist preference
    localStorage.setItem('theme', theme); // nosemgrep: no-localstorage-secrets (UI theme value, not a secret)
  },
}));

// Initialize theme on load
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('theme') as
    | 'light'
    | 'dark'
    | 'system'
    | null;
  const theme = savedTheme || 'system';

  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}
