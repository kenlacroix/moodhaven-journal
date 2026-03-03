import {
  createAIServiceConfig,
  detectRecurringPatterns,
  getFallbackPrompts,
} from './aiService';
import { createDefaultSettings } from '../types/settings';
import type { AggregatedMetadata, TimeOfDay } from '../types/ai';

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
});
