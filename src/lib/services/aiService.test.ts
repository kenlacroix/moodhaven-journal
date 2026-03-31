import {
  createAIServiceConfig,
  detectRecurringPatterns,
  getFallbackPrompts,
  formatTranscript,
} from './aiService';
import { createDefaultSettings } from '../../types/settings';
import type { AggregatedMetadata, TimeOfDay } from '../../types/ai';

function createTestMetadata(
  overrides: Partial<AggregatedMetadata> = {}
): AggregatedMetadata {
  return {
    periodDays: 30,
    totalEntries: 10,
    moodStats: {
      average: 3.5,
      trend: 'stable',
      volatility: 'medium',
      distribution: { 1: 1, 2: 2, 3: 3, 4: 2, 5: 2 },
      recentAverage: 3.5,
    },
    patterns: {
      bestDayOfWeek: 'Monday',
      worstDayOfWeek: 'Wednesday',
      bestTimeOfDay: 'morning',
      frequency: 'regular',
      currentStreak: 3,
      longestStreak: 7,
    },
    emotionalProfile: {
      dominantIndicators: ['happy', 'grateful'],
      recentIndicators: ['happy'],
      gratitudeFrequency: 0.4,
      goalsFrequency: 0.3,
    },
    sentimentBreakdown: {
      positive: 0.4,
      negative: 0.2,
      neutral: 0.3,
      mixed: 0.1,
    },
    ...overrides,
  };
}

describe('aiService', () => {
  describe('createAIServiceConfig', () => {
    it('returns provider "none" when AI is disabled', () => {
      const settings = createDefaultSettings(); // ai.enabled is false by default
      const config = createAIServiceConfig(settings);
      expect(config.provider).toBe('none');
    });

    it('returns provider "openai" with key when configured', () => {
      const settings = createDefaultSettings();
      settings.ai.enabled = true;
      settings.ai.provider = 'openai';
      settings.ai.openai.apiKey = 'sk-test-key';
      const config = createAIServiceConfig(settings);
      expect(config.provider).toBe('openai');
      expect(config.openaiKey).toBe('sk-test-key');
    });

    it('returns provider "local" with endpoint when configured', () => {
      const settings = createDefaultSettings();
      settings.ai.enabled = true;
      settings.ai.provider = 'local';
      settings.ai.localAI.endpoint = 'http://localhost:11434';
      const config = createAIServiceConfig(settings);
      expect(config.provider).toBe('local');
      expect(config.localEndpoint).toBe('http://localhost:11434');
    });

    it('omits openaiKey when it is null', () => {
      const settings = createDefaultSettings();
      settings.ai.enabled = true;
      settings.ai.provider = 'openai';
      settings.ai.openai.apiKey = null;
      const config = createAIServiceConfig(settings);
      expect(config.openaiKey).toBeUndefined();
    });
  });

  describe('detectRecurringPatterns', () => {
    it('detects weekly mood pattern when best/worst days differ', () => {
      const metadata = createTestMetadata();
      const patterns = detectRecurringPatterns(metadata);
      const weekly = patterns.find((p) => p.id === 'weekly-mood-pattern');
      expect(weekly).toBeDefined();
      expect(weekly!.type).toBe('weekly_pattern');
      expect(weekly!.description).toContain('Monday');
      expect(weekly!.description).toContain('Wednesday');
    });

    it('includes scheduling suggestion for weekly pattern', () => {
      const metadata = createTestMetadata();
      const patterns = detectRecurringPatterns(metadata);
      const weekly = patterns.find((p) => p.id === 'weekly-mood-pattern');
      expect(weekly!.suggestion).toContain('Monday');
    });

    it('detects time preference pattern', () => {
      const metadata = createTestMetadata();
      const patterns = detectRecurringPatterns(metadata);
      const time = patterns.find((p) => p.id === 'time-preference');
      expect(time).toBeDefined();
      expect(time!.description).toContain('morning');
    });

    it('detects gratitude habit when frequency > 50%', () => {
      const metadata = createTestMetadata({
        emotionalProfile: {
          dominantIndicators: ['grateful'],
          recentIndicators: ['grateful'],
          gratitudeFrequency: 0.75,
          goalsFrequency: 0.3,
        },
      });
      const patterns = detectRecurringPatterns(metadata);
      const gratitude = patterns.find((p) => p.id === 'gratitude-habit');
      expect(gratitude).toBeDefined();
      expect(gratitude!.description).toContain('75%');
    });

    it('does NOT detect gratitude habit when frequency <= 50%', () => {
      const metadata = createTestMetadata(); // 0.4 frequency
      const patterns = detectRecurringPatterns(metadata);
      const gratitude = patterns.find((p) => p.id === 'gratitude-habit');
      expect(gratitude).toBeUndefined();
    });

    it('detects high mood volatility pattern', () => {
      const metadata = createTestMetadata({
        moodStats: {
          average: 3,
          trend: 'stable',
          volatility: 'high',
          distribution: { 1: 5, 2: 0, 3: 0, 4: 0, 5: 5 },
          recentAverage: 3,
        },
      });
      const patterns = detectRecurringPatterns(metadata);
      const volatility = patterns.find((p) => p.id === 'mood-volatility');
      expect(volatility).toBeDefined();
      expect(volatility!.type).toBe('mood_cycle');
    });

    it('detects streak celebration when streak >= 7', () => {
      const metadata = createTestMetadata({
        patterns: {
          bestDayOfWeek: 'Monday',
          worstDayOfWeek: 'Wednesday',
          bestTimeOfDay: 'morning',
          frequency: 'daily',
          currentStreak: 10,
          longestStreak: 15,
        },
      });
      const patterns = detectRecurringPatterns(metadata);
      const streak = patterns.find((p) => p.id === 'streak-celebration');
      expect(streak).toBeDefined();
      expect(streak!.description).toContain('10');
    });

    it('does NOT detect streak celebration when streak < 7', () => {
      const metadata = createTestMetadata(); // currentStreak: 3
      const patterns = detectRecurringPatterns(metadata);
      const streak = patterns.find((p) => p.id === 'streak-celebration');
      expect(streak).toBeUndefined();
    });

    it('returns empty array when no patterns match', () => {
      const metadata = createTestMetadata({
        patterns: {
          bestDayOfWeek: 'Monday',
          worstDayOfWeek: 'Monday', // same day -> no weekly pattern
          bestTimeOfDay: '' as unknown as TimeOfDay, // empty -> no time pattern (falsy)
          frequency: 'sporadic',
          currentStreak: 1,
          longestStreak: 3,
        },
        moodStats: {
          average: 3,
          trend: 'stable',
          volatility: 'medium', // not high
          distribution: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
          recentAverage: 3,
        },
        emotionalProfile: {
          dominantIndicators: [],
          recentIndicators: [],
          gratitudeFrequency: 0.3, // not > 0.5
          goalsFrequency: 0.2,
        },
      });
      const patterns = detectRecurringPatterns(metadata);
      expect(patterns).toHaveLength(0);
    });
  });

  describe('getFallbackPrompts', () => {
    it('returns requested number of prompts', () => {
      const prompts = getFallbackPrompts(2);
      expect(prompts).toHaveLength(2);
    });

    it('returns 3 prompts by default', () => {
      const prompts = getFallbackPrompts();
      expect(prompts).toHaveLength(3);
    });

    it('returns at most pool-size prompts', () => {
      // Pool now contains 12 prompts (expanded for the drawer gallery)
      const prompts = getFallbackPrompts(20);
      expect(prompts.length).toBeLessThanOrEqual(12);
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('each prompt has required fields', () => {
      const prompts = getFallbackPrompts(5);
      for (const prompt of prompts) {
        expect(prompt.id).toBeTruthy();
        expect(prompt.text).toBeTruthy();
        expect(prompt.category).toBeTruthy();
        expect(prompt.reasoning).toBeTruthy();
        expect(typeof prompt.relevance).toBe('number');
      }
    });
  });

  // ── formatTranscript ───────────────────────────────────────────────────────

  describe('formatTranscript', () => {
    const rawText = 'I um went to the store and bought some uh groceries';

    it('layer "local" calls cleanTranscript and returns source "local"', async () => {
      const result = await formatTranscript(rawText, 'standard', {
        layer: 'local',
        cloudConsentGiven: false,
      });
      expect(result.source).toBe('local');
      // Fillers should be removed
      expect(result.formatted).not.toContain(' um ');
      expect(result.formatted).not.toContain(' uh ');
    });

    it('layer "openai" with cloudConsentGiven false throws CONSENT_REQUIRED', async () => {
      await expect(
        formatTranscript(rawText, 'standard', {
          layer: 'openai',
          cloudConsentGiven: false,
          openaiKey: 'sk-test',
        })
      ).rejects.toThrow('CONSENT_REQUIRED');
    });

    it('layer "openai" with no key falls back to local', async () => {
      const result = await formatTranscript(rawText, 'standard', {
        layer: 'openai',
        cloudConsentGiven: true,
        openaiKey: undefined,
      });
      expect(result.source).toBe('local');
    });

    it('layer "ollama" on network failure falls back to L1 with source "local"', async () => {
      // Ollama is not running in tests so fetch will fail
      const result = await formatTranscript(rawText, 'standard', {
        layer: 'ollama',
        cloudConsentGiven: false,
        ollamaEndpoint: 'http://127.0.0.1:0', // unreachable port
      });
      expect(result.source).toBe('local');
    });

    it('layer "openai" on network failure falls back to L1 with source "local"', async () => {
      // Provide a fake key but mock fetch to throw
      const originalFetch = globalThis.fetch;
      globalThis.fetch = () => Promise.reject(new Error('Network error'));
      try {
        const result = await formatTranscript(rawText, 'standard', {
          layer: 'openai',
          cloudConsentGiven: true,
          openaiKey: 'sk-fake-key',
        });
        expect(result.source).toBe('local');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('L2 Ollama happy path returns formatted text with source "ollama"', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'I went to the store and bought groceries.' }),
      } as Response);
      try {
        const result = await formatTranscript(rawText, 'standard', {
          layer: 'ollama',
          cloudConsentGiven: false,
          ollamaEndpoint: 'http://localhost:11434',
          ollamaModel: 'llama2',
        });
        expect(result.source).toBe('ollama');
        expect(result.formatted).toBe('I went to the store and bought groceries.');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('L3 OpenAI happy path returns formatted text with source "openai"', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'I went to the store and bought groceries.' } }],
        }),
      } as Response);
      try {
        const result = await formatTranscript(rawText, 'standard', {
          layer: 'openai',
          cloudConsentGiven: true,
          openaiKey: 'sk-test-key',
        });
        expect(result.source).toBe('openai');
        expect(result.formatted).toBe('I went to the store and bought groceries.');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('L2 Ollama AbortError (timeout) falls back to L1 with source "local"', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new DOMException('The operation was aborted.', 'AbortError')
      );
      try {
        const result = await formatTranscript(rawText, 'standard', {
          layer: 'ollama',
          cloudConsentGiven: false,
          ollamaEndpoint: 'http://localhost:11434',
          ollamaModel: 'llama2',
        });
        expect(result.source).toBe('local');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('L3 OpenAI 401 falls back to L1 with source "local"', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      } as Response);
      try {
        const result = await formatTranscript(rawText, 'standard', {
          layer: 'openai',
          cloudConsentGiven: true,
          openaiKey: 'sk-bad-key',
        });
        expect(result.source).toBe('local');
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
