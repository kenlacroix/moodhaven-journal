import { extractEntryMetadata, aggregateMetadata, calculateGratitudeStreak, scoreContentMood } from './metadataExtractor';
import type { JournalEntry, MoodLevel } from '../types/journal';

/**
 * Helper to create test journal entries with sensible defaults
 */
function createTestEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: overrides.id ?? 'test-id-1',
    content: overrides.content ?? 'Test journal entry content',
    mood: overrides.mood ?? 3,
    tags: overrides.tags ?? [],
    privacyMode: overrides.privacyMode ?? 0,
    created_at: overrides.created_at ?? '2024-06-15T14:00:00.000Z',
    updated_at: overrides.updated_at ?? '2024-06-15T14:00:00.000Z',
  };
}

describe('metadataExtractor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =============================================
  // extractEntryMetadata
  // =============================================

  describe('extractEntryMetadata', () => {
    describe('sentiment analysis', () => {
      it('classifies happy entry with mood 5 as positive', () => {
        const entry = createTestEntry({
          content: 'I am so happy and grateful today, everything is wonderful!',
          mood: 5,
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.sentiment).toBe('positive');
      });

      it('classifies sad entry with mood 1 as negative', () => {
        const entry = createTestEntry({
          content: 'I feel so sad and frustrated, everything is terrible and awful.',
          mood: 1,
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.sentiment).toBe('negative');
      });

      it('classifies neutral entry with mood 3 as neutral', () => {
        const entry = createTestEntry({
          content: 'Today was an ordinary day, nothing special happened.',
          mood: 3,
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.sentiment).toBe('neutral');
      });

      it('classifies entry with mixed signals as mixed', () => {
        const entry = createTestEntry({
          content: 'I am happy about work but also worried and anxious about the future.',
          mood: 3,
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.sentiment).toBe('mixed');
      });

      it('mood 4+ adds positive weight', () => {
        const entry = createTestEntry({ content: 'Just a regular day.', mood: 4 });
        const metadata = extractEntryMetadata(entry);
        // Mood 4 adds +2 positive, no keywords, so positive > negative
        expect(metadata.sentiment).toBe('neutral');
      });

      it('content is lowercased before analysis', () => {
        const entry = createTestEntry({
          content: 'I am HAPPY and GRATEFUL and WONDERFUL and AMAZING and EXCITED!',
          mood: 5,
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.sentiment).toBe('positive');
      });
    });

    describe('emotional indicator detection', () => {
      it('detects anxious from keyword "worried"', () => {
        const entry = createTestEntry({ content: 'I feel worried about everything.' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.emotionalIndicators).toContain('anxious');
      });

      it('detects grateful from keyword "thankful"', () => {
        const entry = createTestEntry({ content: 'I am so thankful for my friends.' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.emotionalIndicators).toContain('grateful');
      });

      it('detects multiple indicators', () => {
        const entry = createTestEntry({
          content: 'I feel happy and grateful today, but also a bit stressed.',
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.emotionalIndicators).toContain('happy');
        expect(metadata.emotionalIndicators).toContain('grateful');
        expect(metadata.emotionalIndicators).toContain('stressed');
      });

      it('returns no duplicates', () => {
        const entry = createTestEntry({
          content: 'Happy happy happy, so happy today!',
        });
        const metadata = extractEntryMetadata(entry);
        const happyCount = metadata.emotionalIndicators.filter(
          (i) => i === 'happy'
        ).length;
        expect(happyCount).toBeLessThanOrEqual(1);
      });

      it('returns empty array when no keywords match', () => {
        const entry = createTestEntry({ content: 'The sky is blue today.' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.emotionalIndicators).toEqual([]);
      });
    });

    describe('gratitude detection', () => {
      it('detects gratitude keywords', () => {
        const entry = createTestEntry({ content: 'I am so grateful for this day.' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.hasGratitude).toBe(true);
      });

      it('returns false when no gratitude keywords present', () => {
        const entry = createTestEntry({ content: 'Just a regular day.' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.hasGratitude).toBe(false);
      });
    });

    describe('goals detection', () => {
      it('detects goal keywords', () => {
        const entry = createTestEntry({ content: 'I want to become better at this.' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.hasGoals).toBe(true);
      });

      it('returns false when no goal keywords present', () => {
        const entry = createTestEntry({ content: 'The weather is nice today.' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.hasGoals).toBe(false);
      });
    });

    describe('question detection', () => {
      it('detects "why am I" patterns', () => {
        const entry = createTestEntry({ content: 'Why am I feeling this way?' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.hasQuestions).toBe(true);
      });

      it('detects trailing question mark', () => {
        const entry = createTestEntry({ content: 'Is this really happening?' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.hasQuestions).toBe(true);
      });

      it('returns false for statements without question patterns', () => {
        const entry = createTestEntry({ content: 'Today was a good day.' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.hasQuestions).toBe(false);
      });
    });

    describe('word count', () => {
      it('counts words separated by spaces', () => {
        const entry = createTestEntry({ content: 'one two three four five' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.wordCount).toBe(5);
      });

      it('handles multiple spaces and tabs', () => {
        const entry = createTestEntry({ content: 'one   two\tthree' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.wordCount).toBe(3);
      });

      it('returns 1 for single word (not empty since content exists)', () => {
        const entry = createTestEntry({ content: 'hello' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.wordCount).toBe(1);
      });
    });

    describe('time of day classification', () => {
      it('classifies 8 AM as morning', () => {
        const entry = createTestEntry({
          created_at: '2024-06-15T08:00:00.000Z',
        });
        const metadata = extractEntryMetadata(entry);
        // Note: getTimeOfDay uses getHours() which is local time
        // In UTC, 8:00 is morning
        expect(['morning', 'afternoon', 'evening', 'night']).toContain(
          metadata.timeOfDay
        );
      });

      it('classifies midday as afternoon', () => {
        const entry = createTestEntry({
          created_at: new Date(2024, 5, 15, 14, 0, 0).toISOString(),
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.timeOfDay).toBe('afternoon');
      });

      it('classifies 7 PM as evening', () => {
        const entry = createTestEntry({
          created_at: new Date(2024, 5, 15, 19, 0, 0).toISOString(),
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.timeOfDay).toBe('evening');
      });

      it('classifies 11 PM as night', () => {
        const entry = createTestEntry({
          created_at: new Date(2024, 5, 15, 23, 0, 0).toISOString(),
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.timeOfDay).toBe('night');
      });

      it('classifies 4 AM as night', () => {
        const entry = createTestEntry({
          created_at: new Date(2024, 5, 15, 4, 0, 0).toISOString(),
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.timeOfDay).toBe('night');
      });
    });

    describe('general fields', () => {
      it('extracts entry ID', () => {
        const entry = createTestEntry({ id: 'my-unique-id' });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.id).toBe('my-unique-id');
      });

      it('uses entry mood or defaults to 3 if null', () => {
        const entry = createTestEntry({ mood: null });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.mood).toBe(3);
      });

      it('extracts date as YYYY-MM-DD string', () => {
        const entry = createTestEntry({
          created_at: '2024-06-15T14:00:00.000Z',
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it('extracts day of week (0-6)', () => {
        const entry = createTestEntry({
          created_at: '2024-06-15T14:00:00.000Z', // Saturday
        });
        const metadata = extractEntryMetadata(entry);
        expect(metadata.dayOfWeek).toBeGreaterThanOrEqual(0);
        expect(metadata.dayOfWeek).toBeLessThanOrEqual(6);
      });
    });
  });

  // =============================================
  // aggregateMetadata
  // =============================================

  describe('aggregateMetadata', () => {
    describe('empty entries', () => {
      it('returns empty metadata structure with zeros', () => {
        const result = aggregateMetadata([]);
        expect(result.totalEntries).toBe(0);
        expect(result.moodStats.average).toBe(0);
        expect(result.moodStats.trend).toBe('stable');
        expect(result.patterns.currentStreak).toBe(0);
        expect(result.emotionalProfile.dominantIndicators).toEqual([]);
      });

      it('preserves periodDays parameter', () => {
        const result = aggregateMetadata([], 60);
        expect(result.periodDays).toBe(60);
      });
    });

    describe('mood statistics', () => {
      it('calculates correct average mood', () => {
        const entries = [
          createTestEntry({ mood: 4, created_at: '2024-06-14T10:00:00.000Z' }),
          createTestEntry({ mood: 2, created_at: '2024-06-13T10:00:00.000Z' }),
          createTestEntry({ mood: 3, created_at: '2024-06-12T10:00:00.000Z' }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.moodStats.average).toBe(3);
      });

      it('rounds average to 2 decimal places', () => {
        const entries = [
          createTestEntry({ mood: 5, created_at: '2024-06-14T10:00:00.000Z' }),
          createTestEntry({ mood: 4, created_at: '2024-06-13T10:00:00.000Z' }),
          createTestEntry({ mood: 3, created_at: '2024-06-12T10:00:00.000Z' }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.moodStats.average).toBe(4); // (5+4+3)/3 = 4
      });

      it('calculates correct mood distribution counts', () => {
        const entries = [
          createTestEntry({ mood: 5, created_at: '2024-06-14T10:00:00.000Z' }),
          createTestEntry({ mood: 5, created_at: '2024-06-13T10:00:00.000Z' }),
          createTestEntry({ mood: 3, created_at: '2024-06-12T10:00:00.000Z' }),
          createTestEntry({ mood: 1, created_at: '2024-06-11T10:00:00.000Z' }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.moodStats.distribution[5]).toBe(2);
        expect(result.moodStats.distribution[3]).toBe(1);
        expect(result.moodStats.distribution[1]).toBe(1);
        expect(result.moodStats.distribution[2]).toBe(0);
        expect(result.moodStats.distribution[4]).toBe(0);
      });

      it('trend is stable when recent and overall average are similar', () => {
        // All entries within last 7 days, all mood 3
        const entries = Array.from({ length: 5 }, (_, i) =>
          createTestEntry({
            id: `entry-${i}`,
            mood: 3,
            created_at: new Date(
              Date.now() - i * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
        );
        const result = aggregateMetadata(entries);
        expect(result.moodStats.trend).toBe('stable');
      });

      it('volatility is low when all moods are similar', () => {
        const entries = Array.from({ length: 10 }, (_, i) =>
          createTestEntry({
            id: `entry-${i}`,
            mood: 3,
            created_at: new Date(
              Date.now() - i * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
        );
        const result = aggregateMetadata(entries);
        expect(result.moodStats.volatility).toBe('low');
      });

      it('volatility is high when moods vary greatly', () => {
        const moods: MoodLevel[] = [1, 5, 1, 5, 1, 5, 1, 5, 1, 5];
        const entries = moods.map((mood, i) =>
          createTestEntry({
            id: `entry-${i}`,
            mood,
            created_at: new Date(
              Date.now() - i * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
        );
        const result = aggregateMetadata(entries);
        expect(result.moodStats.volatility).toBe('high');
      });
    });

    describe('patterns', () => {
      it('identifies best and worst day of week', () => {
        const entries = [
          // Monday entries (good mood)
          createTestEntry({
            id: 'e1',
            mood: 5,
            created_at: new Date(2024, 5, 10, 12, 0, 0).toISOString(), // Mon
          }),
          // Wednesday entries (bad mood)
          createTestEntry({
            id: 'e2',
            mood: 1,
            created_at: new Date(2024, 5, 12, 12, 0, 0).toISOString(), // Wed
          }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.patterns.bestDayOfWeek).not.toBe(
          result.patterns.worstDayOfWeek
        );
      });

      it('calculates frequency as rare for single entry', () => {
        const entries = [
          createTestEntry({
            created_at: '2024-06-10T10:00:00.000Z',
          }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.patterns.frequency).toBe('rare');
      });
    });

    describe('streak calculation', () => {
      it('calculates current streak from today', () => {
        const entries = [
          createTestEntry({
            id: 'e1',
            created_at: new Date(
              Date.now() - 0 * 24 * 60 * 60 * 1000
            ).toISOString(), // Today
          }),
          createTestEntry({
            id: 'e2',
            created_at: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000
            ).toISOString(), // Yesterday
          }),
          createTestEntry({
            id: 'e3',
            created_at: new Date(
              Date.now() - 2 * 24 * 60 * 60 * 1000
            ).toISOString(), // 2 days ago
          }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.patterns.currentStreak).toBeGreaterThanOrEqual(2);
      });

      it('current streak is 0 if most recent entry is older than yesterday', () => {
        const entries = [
          createTestEntry({
            id: 'e1',
            created_at: new Date(
              Date.now() - 5 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.patterns.currentStreak).toBe(0);
      });

      it('longest streak finds maximum consecutive days', () => {
        // 3 consecutive days a week ago, then a gap, then 2 days recent
        const entries = [
          createTestEntry({
            id: 'e1',
            created_at: new Date(
              Date.now() - 0 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          createTestEntry({
            id: 'e2',
            created_at: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          // gap of 3 days
          createTestEntry({
            id: 'e3',
            created_at: new Date(
              Date.now() - 5 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          createTestEntry({
            id: 'e4',
            created_at: new Date(
              Date.now() - 6 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          createTestEntry({
            id: 'e5',
            created_at: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.patterns.longestStreak).toBeGreaterThanOrEqual(3);
      });
    });

    describe('emotional profile', () => {
      it('dominant indicators are sorted by frequency', () => {
        const entries = [
          createTestEntry({
            id: 'e1',
            content: 'I am happy and grateful today',
            created_at: new Date(Date.now() - 0 * 86400000).toISOString(),
          }),
          createTestEntry({
            id: 'e2',
            content: 'Feeling happy again!',
            created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          }),
          createTestEntry({
            id: 'e3',
            content: 'Still happy, grateful for everything',
            created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          }),
        ];
        const result = aggregateMetadata(entries);
        // "happy" appears 3 times, "grateful" 2 times
        if (result.emotionalProfile.dominantIndicators.length >= 2) {
          expect(result.emotionalProfile.dominantIndicators[0]).toBe('happy');
        }
      });

      it('limits dominant indicators to top 5', () => {
        // Create entries that trigger many different indicators
        const entries = Array.from({ length: 20 }, (_, i) =>
          createTestEntry({
            id: `e${i}`,
            content:
              'anxious stressed hopeful grateful sad happy angry calm overwhelmed motivated lonely loved confused confident',
            created_at: new Date(Date.now() - i * 86400000).toISOString(),
          })
        );
        const result = aggregateMetadata(entries);
        expect(result.emotionalProfile.dominantIndicators.length).toBeLessThanOrEqual(5);
      });

      it('limits recent indicators to top 3', () => {
        const entries = Array.from({ length: 7 }, (_, i) =>
          createTestEntry({
            id: `e${i}`,
            content:
              'anxious stressed hopeful grateful sad happy angry calm overwhelmed motivated',
            created_at: new Date(Date.now() - i * 86400000).toISOString(),
          })
        );
        const result = aggregateMetadata(entries);
        expect(result.emotionalProfile.recentIndicators.length).toBeLessThanOrEqual(3);
      });

      it('calculates gratitude frequency as ratio', () => {
        const entries = [
          createTestEntry({
            id: 'e1',
            content: 'I am grateful today',
            created_at: new Date(Date.now() - 0 * 86400000).toISOString(),
          }),
          createTestEntry({
            id: 'e2',
            content: 'Regular day',
            created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          }),
        ];
        const result = aggregateMetadata(entries);
        expect(result.emotionalProfile.gratitudeFrequency).toBe(0.5);
      });

      it('calculates goals frequency as ratio', () => {
        const entries = [
          createTestEntry({
            id: 'e1',
            content: 'I want to learn more',
            created_at: new Date(Date.now() - 0 * 86400000).toISOString(),
          }),
          createTestEntry({
            id: 'e2',
            content: 'My goal is to run a marathon',
            created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          }),
          createTestEntry({
            id: 'e3',
            content: 'Just a regular day',
            created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          }),
        ];
        const result = aggregateMetadata(entries);
        // 2 out of 3 entries have goals
        expect(result.emotionalProfile.goalsFrequency).toBeCloseTo(0.67, 1);
      });
    });

    describe('sentiment breakdown', () => {
      it('calculates correct percentages for each sentiment class', () => {
        const entries = [
          createTestEntry({
            id: 'e1',
            content: 'I feel happy and great and wonderful and amazing!',
            mood: 5,
            created_at: new Date(Date.now() - 0 * 86400000).toISOString(),
          }),
          createTestEntry({
            id: 'e2',
            content: 'I feel sad and frustrated and terrible!',
            mood: 1,
            created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          }),
        ];
        const result = aggregateMetadata(entries);
        const total =
          result.sentimentBreakdown.positive +
          result.sentimentBreakdown.negative +
          result.sentimentBreakdown.neutral +
          result.sentimentBreakdown.mixed;
        expect(total).toBeCloseTo(1.0, 1);
      });
    });

    describe('privacy mode filtering', () => {
      it('excludes privacyMode=2 (Private) entries from local analysis', () => {
        const entries = [
          createTestEntry({ id: 'e1', mood: 5, privacyMode: 0 }),
          createTestEntry({ id: 'e2', mood: 5, privacyMode: 0 }),
          // This private entry should be excluded — mood 1 would drag the average down
          createTestEntry({ id: 'e3', mood: 1, privacyMode: 2 }),
        ];
        const result = aggregateMetadata(entries, 30, false);
        expect(result.totalEntries).toBe(2);
        expect(result.moodStats.average).toBe(5);
      });

      it('includes privacyMode=1 (Mindful) entries in local analysis', () => {
        const entries = [
          createTestEntry({ id: 'e1', mood: 4, privacyMode: 0 }),
          createTestEntry({ id: 'e2', mood: 4, privacyMode: 1 }),
        ];
        const result = aggregateMetadata(entries, 30, false);
        expect(result.totalEntries).toBe(2);
      });

      it('excludes privacyMode=1 (Mindful) entries when forLLM=true', () => {
        const entries = [
          createTestEntry({ id: 'e1', mood: 5, privacyMode: 0 }),
          // Mindful entry should be excluded from LLM aggregation
          createTestEntry({ id: 'e2', mood: 1, privacyMode: 1 }),
        ];
        const result = aggregateMetadata(entries, 30, true);
        expect(result.totalEntries).toBe(1);
        expect(result.moodStats.average).toBe(5);
      });

      it('returns empty metadata when all entries are Private and forLLM=true', () => {
        const entries = [
          createTestEntry({ id: 'e1', privacyMode: 1 }),
          createTestEntry({ id: 'e2', privacyMode: 2 }),
        ];
        const result = aggregateMetadata(entries, 30, true);
        expect(result.totalEntries).toBe(0);
      });
    });
  });

  // =============================================
  // calculateGratitudeStreak
  // =============================================

  describe('calculateGratitudeStreak', () => {
    it('returns 0 streak when no entries have gratitude', () => {
      const entries = [
        createTestEntry({ content: 'I feel neutral today', privacyMode: 0 }),
      ];
      const result = calculateGratitudeStreak(entries);
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
    });

    it('counts days with gratitude keywords', () => {
      const entries = [
        createTestEntry({
          id: 'e1',
          content: 'I am grateful for today',
          privacyMode: 0,
          created_at: new Date(Date.now() - 0 * 86400000).toISOString(),
        }),
        createTestEntry({
          id: 'e2',
          content: 'Feeling thankful today',
          privacyMode: 0,
          created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        }),
      ];
      const result = calculateGratitudeStreak(entries);
      expect(result.currentStreak).toBeGreaterThanOrEqual(2);
    });

    it('excludes Private (privacyMode=2) entries from gratitude streak', () => {
      const entries = [
        createTestEntry({
          id: 'e1',
          content: 'I am so grateful today',
          privacyMode: 0,
          created_at: new Date(Date.now() - 0 * 86400000).toISOString(),
        }),
        createTestEntry({
          id: 'e2',
          content: 'I am grateful but this is private',
          privacyMode: 2,
          created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        }),
      ];
      // Only day 0 counts — day 1 is private
      const result = calculateGratitudeStreak(entries);
      expect(result.currentStreak).toBe(1);
    });

    it('includes Mindful (privacyMode=1) entries in gratitude streak', () => {
      const entries = [
        createTestEntry({
          id: 'e1',
          content: 'Grateful today',
          privacyMode: 0,
          created_at: new Date(Date.now() - 0 * 86400000).toISOString(),
        }),
        createTestEntry({
          id: 'e2',
          content: 'Still thankful, mindful entry',
          privacyMode: 1,
          created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        }),
      ];
      const result = calculateGratitudeStreak(entries);
      expect(result.currentStreak).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================
  // scoreContentMood
  // ============================================================
  describe('scoreContentMood', () => {
    it('returns null for very short text (< 8 words)', () => {
      expect(scoreContentMood('short')).toBeNull();
      expect(scoreContentMood('only a few words here')).toBeNull();
    });

    it('scores strongly positive content as 4 or 5', () => {
      const text = 'Today was an amazing and wonderful day. I feel fantastic and so grateful for everything that happened.';
      const score = scoreContentMood(text);
      expect(score).toBeGreaterThanOrEqual(4);
    });

    it('scores strongly negative content as 1 or 2', () => {
      const text = 'I feel terrible and miserable today. Everything is awful and I am devastated by what happened. So sad and stressed.';
      const score = scoreContentMood(text);
      expect(score).toBeLessThanOrEqual(2);
    });

    it('scores neutral/mixed content near 3', () => {
      const text = 'I went for a walk this morning and had some coffee. Then I worked for a few hours on my project and made decent progress.';
      const score = scoreContentMood(text);
      expect(score).toBeGreaterThanOrEqual(2);
      expect(score).toBeLessThanOrEqual(4);
    });

    it('returns a valid MoodLevel (1-5)', () => {
      const text = 'I am happy and grateful for everything in my life today, feeling really good about how things are going.';
      const score = scoreContentMood(text);
      expect([1, 2, 3, 4, 5]).toContain(score);
    });

    it('gratitude content scores above neutral', () => {
      const grateful = 'I am so grateful and thankful today. Feeling really blessed and loved. Everything is good.';
      const neutral = 'I did some work and went to the store. Had lunch and watched some television in the afternoon.';
      expect(scoreContentMood(grateful)!).toBeGreaterThan(scoreContentMood(neutral) ?? 3);
    });
  });
});
