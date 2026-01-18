/**
 * App Store
 *
 * Global application state using Zustand.
 * Handles authentication state and app settings.
 */

import { create } from 'zustand';
import {
  hasPassword,
  setupPassword,
  unlockJournal,
  lockJournal,
} from '../lib/journalService';

interface AppState {
  // Authentication
  isInitialized: boolean;
  isUnlocked: boolean;

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
  theme: 'system',

  // Check if user has set up password
  checkInitialization: async () => {
    try {
      const initialized = await hasPassword();
      set({ isInitialized: initialized });
    } catch (error) {
      console.error('Failed to check initialization:', error);
      set({ isInitialized: false });
    }
  },

  // First-time setup with password
  initialize: async (password: string) => {
    try {
      await setupPassword(password);
      // Auto-unlock after setup
      const unlocked = await unlockJournal(password);
      set({ isInitialized: true, isUnlocked: unlocked });
      return true;
    } catch (error) {
      console.error('Failed to initialize:', error);
      return false;
    }
  },

  // Unlock with password
  unlock: async (password: string) => {
    try {
      const success = await unlockJournal(password);
      if (success) {
        set({ isUnlocked: true });
      }
      return success;
    } catch (error) {
      console.error('Failed to unlock:', error);
      return false;
    }
  },

  // Lock the journal
  lock: () => {
    lockJournal();
    set({ isUnlocked: false });
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
    localStorage.setItem('theme', theme);
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
