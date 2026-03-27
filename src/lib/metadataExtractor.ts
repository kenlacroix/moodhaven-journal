/**
 * Local Metadata Extraction Service
 *
 * PRIVACY-FIRST: All processing happens on-device.
 * Extracts patterns and metadata from journal entries
 * without exposing actual content to external services.
 */

import type { JournalEntry, MoodLevel } from '../types/journal';
import type {
  EntryMetadata,
  AggregatedMetadata,
  SentimentClass,
  EmotionalIndicator,
  TimeOfDay,
  FrequencyPattern,
} from '../types/ai';
import {
  EMOTION_KEYWORDS,
  GRATITUDE_KEYWORDS,
  GOALS_KEYWORDS,
  QUESTION_PATTERNS,
} from '../types/ai';

// ============================================
// MOOD AUTO-SCORING (Local, runs on-device)
// ============================================

// ── Emoji sentiment sets (language-agnostic supplement) ──────────────────────
// Using individual code points so `for...of` iteration works correctly with
// multi-byte emoji.  Only unambiguously positive/negative emojis are included.

const POSITIVE_EMOJIS = new Set([
  '😊', '😄', '😃', '😁', '😀', '😆', '🤣', '😂', '🥰', '😍',
  '🤩', '😘', '😗', '😙', '😚', '🙂', '😌', '😎', '🤗', '🥳',
  '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🌟', '⭐', '✨', '🌈',
  '❤', '🧡', '💛', '💚', '💙', '💜', '💕', '💖', '💗', '💓',
  '💞', '💝', '💘', '💟', '☺', '😸', '🌺', '🌸', '🌼', '🌻',
  '🍀', '🙌', '👍', '💪', '🤝', '✅', '🎶', '🎵', '🥂', '🍾',
  '☀', '🌤', '🌞', '😜', '😝', '🤪', '😋', '✌', '🤞',
]);

const NEGATIVE_EMOJIS = new Set([
  '😔', '😟', '😢', '😭', '😞', '😩', '😫', '😖', '😤', '😡',
  '🤬', '😠', '😒', '🙁', '☹', '😣', '💔', '😪', '😥', '😓',
  '🥺', '😰', '😨', '😱', '😳', '🤯', '😑', '😬', '💀', '☠',
  '🤮', '🤢', '🥀', '👎', '🚫', '❌', '💩',
]);

/**
 * Score sentiment from emojis in text.
 * Language-agnostic — works regardless of written language.
 *
 * Returns a ratio in [-1, +1], or null when no emoji signals are found.
 */
export function scoreEmojiSentiment(text: string): number | null {
  let positive = 0;
  let negative = 0;

  // `for...of` iterates by Unicode code point, correctly handling emoji
  for (const char of text) {
    if (POSITIVE_EMOJIS.has(char)) positive++;
    else if (NEGATIVE_EMOJIS.has(char)) negative++;
  }

  const total = positive + negative;
  if (total === 0) return null;
  return (positive - negative) / (total + 1);
}

// Signal words — intentionally broad to catch natural expression
const STRONG_POSITIVE_SIGNALS = [
  'amazing', 'fantastic', 'wonderful', 'incredible', 'ecstatic', 'thrilled',
  'euphoric', 'overjoyed', 'excellent', 'extraordinary', 'phenomenal',
  'brilliant', 'best day', 'so happy', 'so proud', 'absolutely love',
  'over the moon', 'on top of the world', 'best i have', "best i've",
];

const MODERATE_POSITIVE_SIGNALS = [
  'happy', 'good', 'glad', 'great', 'nice', 'enjoyed', 'enjoy', 'pleased',
  'positive', 'better', 'lovely', 'smile', 'smiling', 'fun', 'exciting',
  'excited', 'proud', 'accomplished', 'achievement', 'relieved', 'hopeful',
  'grateful', 'thankful', 'blessed', 'appreciate', 'peaceful', 'calm',
  'relaxed', 'motivated', 'inspired', 'confident', 'love', 'supported',
  'refreshed', 'energized', 'content', 'satisfied', 'uplifted', 'joy',
  'cheerful', 'delight', 'thriving', 'flourishing', 'lucky', 'fortunate',
  // Common words absent from the original list
  'awesome', 'laugh', 'laughing', 'laughter', 'beautiful', 'alive', 'perfect',
  'grateful for', 'thankful for', 'looking forward', 'proud of',
];

const STRONG_NEGATIVE_SIGNALS = [
  'terrible', 'awful', 'horrible', 'devastated', 'miserable', 'heartbroken',
  'hopeless', 'worthless', 'unbearable', 'nightmare', 'catastrophe',
  'despair', 'shattered', 'rock bottom', 'falling apart', 'hate my life',
  'cannot cope', "can't cope", "can't take it", 'breaking point', 'giving up',
  'want to give up', 'at my wit', 'hit a wall',
];

const MODERATE_NEGATIVE_SIGNALS = [
  // Emotional states
  'sad', 'upset', 'worried', 'anxious', 'stressed', 'frustrated', 'angry',
  'disappointed', 'hurt', 'depressed', 'lonely', 'scared', 'nervous',
  'overwhelmed', 'annoyed', 'irritated', 'lost', 'confused', 'regret',
  'guilty', 'ashamed', 'embarrassed', 'jealous', 'bitter', 'resentful',
  'dread', 'dreading', 'afraid', 'fearful',
  // Physical/energy signals
  'exhausted', 'drained', 'depleted', 'zapped', 'wiped out', 'burned out',
  'burnt out', 'run down', 'worn out', 'weary', 'fatigued', 'sluggish',
  'lethargic', 'heavy', 'no energy',
  // Struggle phrases
  'struggling', 'hard day', 'tough day', 'rough day', 'hardest', 'toughest',
  'roughest', 'difficult', 'tough', 'rough', 'challenging', 'hard time',
  'tough time', 'rough time', 'getting to me', 'wearing me', 'takes a toll',
  'took a toll', 'tested me', 'pushed me', 'getting worse', 'not okay',
  "didn't go well", 'went wrong', 'went badly',
  // Social/interpersonal negative
  'upsets me', 'upsetting', 'bothers me', 'bothering', 'irritates me',
  'getting on my nerves', 'conflict', 'argument', 'fight with',
  // General negative
  'bad', 'hate', 'crying', 'tears', 'missing', 'lost something',
  // Common words absent from the original list
  'tired', 'exhausted of', 'sick of', 'sick and tired', 'bored', 'pain',
  'ache', 'aching', 'numb', 'empty', 'hollow', 'pointless', 'dull',
];

// Negation words that flip the following signal
const NEGATIONS = [
  "not", "don't", "dont", "didn't", "didnt", "wasn't", "wasnt",
  "aren't", "arent", "isn't", "isnt", "never", "hardly", "barely",
  "couldn't", "couldnt", "wouldn't", "wouldnt", "can't", "cant",
];

/**
 * Count how many signals from a list appear in text.
 * Respects simple negation: if "not", "don't", etc. precede a signal word,
 * the hit is SUBTRACTED instead (e.g. "not happy" → -1 positive hit).
 *
 * Returns net count (can be negative when negation dominates).
 */
function countSignals(text: string, signals: string[]): number {
  let count = 0;
  for (const signal of signals) {
    let idx = text.indexOf(signal);
    while (idx !== -1) {
      // Grab the 25 chars before this match to check for negation
      const before = text.slice(Math.max(0, idx - 25), idx).trim();
      const lastWord = before.split(/\s+/).pop() ?? '';
      const isNegated = NEGATIONS.includes(lastWord);
      count += isNegated ? -1 : 1;
      idx = text.indexOf(signal, idx + signal.length);
    }
  }
  return count;
}

/**
 * Score a block of text, returning a signed ratio in [-1, +1].
 * Ratio-based: immune to entry length (long entries don't skew extreme).
 */
function scoreBlock(text: string): number {
  const pos =
    countSignals(text, STRONG_POSITIVE_SIGNALS) * 2 +
    countSignals(text, MODERATE_POSITIVE_SIGNALS);
  const neg =
    countSignals(text, STRONG_NEGATIVE_SIGNALS) * 2 +
    countSignals(text, MODERATE_NEGATIVE_SIGNALS);

  const total = Math.abs(pos) + Math.abs(neg);
  if (total === 0) return 0;
  return (pos - neg) / (total + 1); // Shrink toward 0 slightly to avoid extremes
}

/**
 * Score the emotional tone of journal text and map to MoodLevel 1-5.
 * Runs entirely on-device.
 *
 * Algorithm:
 *  - Splits text into first half and second half
 *  - Weights second half 2× (the emotional arc / how you finish matters more)
 *  - Ratio-based scoring within each half (immune to entry length)
 *  - Returns null when text is too short (< 5 words) to score reliably
 */
export function scoreContentMood(text: string): MoodLevel | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 5) return null;

  const lower = text.toLowerCase();

  // Split at midpoint — latter half weighted 2× (emotional arc)
  const mid = Math.floor(lower.length / 2);
  const firstHalf = lower.slice(0, mid);
  const secondHalf = lower.slice(mid);

  const firstScore  = scoreBlock(firstHalf);
  const secondScore = scoreBlock(secondHalf);

  // Weighted blend: 33% first half, 67% second half
  let blended = firstScore * 0.33 + secondScore * 0.67;

  // Blend in emoji sentiment when present.
  // When word signals dominate, emoji contributes 20%.
  // When words are neutral (different language / sparse signals), emoji gets 50%.
  const emojiScore = scoreEmojiSentiment(lower);
  if (emojiScore !== null) {
    const emojiWeight = Math.abs(blended) > 0.01 ? 0.2 : 0.5;
    blended = blended * (1 - emojiWeight) + emojiScore * emojiWeight;
  }

  // Map [-1, +1] → [1, 5], centered at 3
  const raw = 3 + blended * 2.5;
  return Math.max(1, Math.min(5, Math.round(raw))) as MoodLevel;
}

/**
 * Extract metadata from a single journal entry
 * This runs entirely on the user's device
 */
export function extractEntryMetadata(entry: JournalEntry): EntryMetadata {
  const content = entry.content.toLowerCase();
  const date = new Date(entry.created_at);

  return {
    id: entry.id,
    mood: entry.mood || 3,
    sentiment: analyzeSentiment(content, entry.mood || 3),
    emotionalIndicators: detectEmotionalIndicators(content),
    wordCount: countWords(entry.content),
    timeOfDay: getTimeOfDay(date),
    dayOfWeek: date.getDay(),
    date: date.toISOString().split('T')[0],
    hasGratitude: detectGratitude(content),
    hasGoals: detectGoals(content),
    hasQuestions: detectQuestions(entry.content),
  };
}

/**
 * Aggregate metadata from multiple entries for AI context.
 *
 * @param entries - All decrypted journal entries
 * @param periodDays - Time window for aggregation
 * @param forLLM - When true, only include Open (privacyMode=0) entries.
 *                 When false (local analysis), include Open and Mindful (privacyMode<2).
 */
export function aggregateMetadata(
  entries: JournalEntry[],
  periodDays: number = 30,
  forLLM: boolean = false
): AggregatedMetadata {
  const eligible = entries.filter((e) =>
    forLLM ? e.privacyMode === 0 : (e.privacyMode ?? 0) < 2
  );

  if (eligible.length === 0) {
    return createEmptyMetadata(periodDays);
  }

  const metadataList = eligible.map(extractEntryMetadata);
  const recentEntries = getRecentEntries(metadataList, 7);

  return {
    periodDays,
    totalEntries: eligible.length,
    moodStats: calculateMoodStats(metadataList, recentEntries),
    patterns: calculatePatterns(metadataList, eligible),
    emotionalProfile: calculateEmotionalProfile(metadataList, recentEntries),
    sentimentBreakdown: calculateSentimentBreakdown(metadataList),
  };
}

/**
 * Aggregate metadata in a single pass for both local (Open+Mindful) and AI (Open-only) consumers.
 * Equivalent to calling aggregateMetadata(entries, 30, false) + aggregateMetadata(entries, 30, true)
 * but avoids iterating the entries array twice.
 */
export function aggregateMetadataBoth(entries: JournalEntry[]): {
  localMeta: AggregatedMetadata;
  aiMeta: AggregatedMetadata;
} {
  return {
    localMeta: aggregateMetadata(entries, 30, false),
    aiMeta: aggregateMetadata(entries, 30, true),
  };
}

// ============================================
// SENTIMENT ANALYSIS (Local)
// ============================================

function analyzeSentiment(content: string, mood: MoodLevel): SentimentClass {
  const positiveWords = [
    'happy', 'great', 'wonderful', 'amazing', 'good', 'love', 'excited',
    'grateful', 'blessed', 'awesome', 'fantastic', 'joy', 'peaceful',
  ];
  const negativeWords = [
    'sad', 'angry', 'frustrated', 'worried', 'anxious', 'stressed', 'bad',
    'terrible', 'awful', 'depressed', 'miserable', 'lonely', 'scared',
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of positiveWords) {
    if (content.includes(word)) positiveCount++;
  }
  for (const word of negativeWords) {
    if (content.includes(word)) negativeCount++;
  }

  // Factor in mood as well
  if (mood >= 4) positiveCount += 2;
  if (mood <= 2) negativeCount += 2;

  if (positiveCount > negativeCount + 2) return 'positive';
  if (negativeCount > positiveCount + 2) return 'negative';
  if (positiveCount > 0 && negativeCount > 0) return 'mixed';
  return 'neutral';
}

function detectEmotionalIndicators(content: string): EmotionalIndicator[] {
  const indicators: EmotionalIndicator[] = [];

  for (const [indicator, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        indicators.push(indicator as EmotionalIndicator);
        break; // Only add each indicator once
      }
    }
  }

  return indicators;
}

function detectGratitude(content: string): boolean {
  return GRATITUDE_KEYWORDS.some((keyword) => content.includes(keyword));
}

function detectGoals(content: string): boolean {
  return GOALS_KEYWORDS.some((keyword) => content.includes(keyword));
}

function detectQuestions(content: string): boolean {
  return QUESTION_PATTERNS.some((pattern) => pattern.test(content));
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getRecentEntries(
  metadataList: EntryMetadata[],
  days: number
): EntryMetadata[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return metadataList.filter((m) => m.date >= cutoffStr);
}

// ============================================
// STATISTICS CALCULATION
// ============================================

function calculateMoodStats(
  all: EntryMetadata[],
  recent: EntryMetadata[]
): AggregatedMetadata['moodStats'] {
  const moods = all.map((m) => m.mood);
  const recentMoods = recent.map((m) => m.mood);

  const average = moods.reduce((a, b) => a + b, 0) / moods.length;
  const recentAverage = recentMoods.length > 0
    ? recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length
    : average;

  // Calculate trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentMoods.length >= 3) {
    const diff = recentAverage - average;
    if (diff > 0.3) trend = 'improving';
    else if (diff < -0.3) trend = 'declining';
  }

  // Calculate volatility (standard deviation)
  const variance = moods.reduce((acc, m) => acc + Math.pow(m - average, 2), 0) / moods.length;
  const stdDev = Math.sqrt(variance);
  let volatility: 'low' | 'medium' | 'high' = 'medium';
  if (stdDev < 0.8) volatility = 'low';
  else if (stdDev > 1.5) volatility = 'high';

  // Distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<MoodLevel, number>;
  for (const mood of moods) {
    distribution[mood as MoodLevel]++;
  }

  return {
    average: Math.round(average * 100) / 100,
    trend,
    volatility,
    distribution,
    recentAverage: Math.round(recentAverage * 100) / 100,
  };
}

function calculatePatterns(
  metadataList: EntryMetadata[],
  entries: JournalEntry[]
): AggregatedMetadata['patterns'] {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Day of week analysis
  const dayMoods: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const m of metadataList) {
    dayMoods[m.dayOfWeek].push(m.mood);
  }

  const dayAverages = Object.entries(dayMoods)
    .filter(([, moods]) => moods.length > 0)
    .map(([day, moods]) => ({
      day: parseInt(day),
      avg: moods.reduce((a, b) => a + b, 0) / moods.length,
    }));

  const bestDay = dayAverages.reduce((a, b) => (a.avg > b.avg ? a : b), dayAverages[0]);
  const worstDay = dayAverages.reduce((a, b) => (a.avg < b.avg ? a : b), dayAverages[0]);

  // Time of day analysis
  const timeMoods: Record<TimeOfDay, number[]> = { morning: [], afternoon: [], evening: [], night: [] };
  for (const m of metadataList) {
    timeMoods[m.timeOfDay].push(m.mood);
  }

  const timeAverages = Object.entries(timeMoods)
    .filter(([, moods]) => moods.length > 0)
    .map(([time, moods]) => ({
      time: time as TimeOfDay,
      avg: moods.reduce((a, b) => a + b, 0) / moods.length,
    }));

  const bestTime = timeAverages.reduce((a, b) => (a.avg > b.avg ? a : b), timeAverages[0]);

  // Frequency calculation
  const frequency = calculateFrequency(entries);

  // Streak calculation
  const { currentStreak, longestStreak } = calculateStreaks(metadataList);

  return {
    bestDayOfWeek: dayNames[bestDay?.day ?? 0],
    worstDayOfWeek: dayNames[worstDay?.day ?? 0],
    bestTimeOfDay: bestTime?.time ?? 'evening',
    frequency,
    currentStreak,
    longestStreak,
  };
}

function calculateFrequency(entries: JournalEntry[]): FrequencyPattern {
  if (entries.length < 2) return 'rare';

  const dates = entries.map((e) => new Date(e.created_at).toISOString().split('T')[0]);
  const uniqueDates = new Set(dates);
  const daySpan = Math.max(
    1,
    (new Date(dates[0]).getTime() - new Date(dates[dates.length - 1]).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const rate = uniqueDates.size / daySpan;

  if (rate >= 0.8) return 'daily';
  if (rate >= 0.4) return 'regular';
  if (rate >= 0.15) return 'sporadic';
  return 'rare';
}

/**
 * Core streak calculation over a sorted-descending list of date strings (YYYY-MM-DD).
 * Shared by calculateStreaks and calculateGratitudeStreak.
 */
function calculateStreaksFromDates(dates: string[]): {
  currentStreak: number;
  longestStreak: number;
} {
  if (dates.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Check current streak
  if (dates[0] === today || dates[0] === yesterday) {
    currentStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

  return { currentStreak, longestStreak };
}

function calculateStreaks(metadataList: EntryMetadata[]): {
  currentStreak: number;
  longestStreak: number;
} {
  const dates = [...new Set(metadataList.map((m) => m.date))].sort().reverse();
  return calculateStreaksFromDates(dates);
}

/**
 * Calculate gratitude-specific streak.
 * Only days where at least one entry contains gratitude indicators count.
 * Respects privacy: pass only eligible entries (privacyMode < 2).
 */
export function calculateGratitudeStreak(entries: JournalEntry[]): {
  currentStreak: number;
  longestStreak: number;
} {
  const eligibleEntries = entries.filter((e) => (e.privacyMode ?? 0) < 2);

  const gratitudeDates = [
    ...new Set(
      eligibleEntries
        .filter((e) => extractEntryMetadata(e).hasGratitude)
        .map((e) => new Date(e.created_at).toISOString().split('T')[0])
    ),
  ]
    .sort()
    .reverse();

  return calculateStreaksFromDates(gratitudeDates);
}

function calculateEmotionalProfile(
  all: EntryMetadata[],
  recent: EntryMetadata[]
): AggregatedMetadata['emotionalProfile'] {
  // Count all emotional indicators
  const indicatorCounts: Record<string, number> = {};
  for (const m of all) {
    for (const indicator of m.emotionalIndicators) {
      indicatorCounts[indicator] = (indicatorCounts[indicator] || 0) + 1;
    }
  }

  // Sort by frequency
  const sortedIndicators = Object.entries(indicatorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([indicator]) => indicator as EmotionalIndicator);

  // Recent indicators
  const recentIndicatorCounts: Record<string, number> = {};
  for (const m of recent) {
    for (const indicator of m.emotionalIndicators) {
      recentIndicatorCounts[indicator] = (recentIndicatorCounts[indicator] || 0) + 1;
    }
  }
  const recentSorted = Object.entries(recentIndicatorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([indicator]) => indicator as EmotionalIndicator);

  // Gratitude and goals frequency
  const gratitudeCount = all.filter((m) => m.hasGratitude).length;
  const goalsCount = all.filter((m) => m.hasGoals).length;

  return {
    dominantIndicators: sortedIndicators.slice(0, 5),
    recentIndicators: recentSorted.slice(0, 3),
    gratitudeFrequency: all.length > 0 ? gratitudeCount / all.length : 0,
    goalsFrequency: all.length > 0 ? goalsCount / all.length : 0,
  };
}

function calculateSentimentBreakdown(
  metadataList: EntryMetadata[]
): AggregatedMetadata['sentimentBreakdown'] {
  const counts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };

  for (const m of metadataList) {
    counts[m.sentiment]++;
  }

  const total = metadataList.length || 1;
  return {
    positive: Math.round((counts.positive / total) * 100) / 100,
    negative: Math.round((counts.negative / total) * 100) / 100,
    neutral: Math.round((counts.neutral / total) * 100) / 100,
    mixed: Math.round((counts.mixed / total) * 100) / 100,
  };
}

function createEmptyMetadata(periodDays: number): AggregatedMetadata {
  return {
    periodDays,
    totalEntries: 0,
    moodStats: {
      average: 0,
      trend: 'stable',
      volatility: 'low',
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      recentAverage: 0,
    },
    patterns: {
      bestDayOfWeek: 'Unknown',
      worstDayOfWeek: 'Unknown',
      bestTimeOfDay: 'evening',
      frequency: 'rare',
      currentStreak: 0,
      longestStreak: 0,
    },
    emotionalProfile: {
      dominantIndicators: [],
      recentIndicators: [],
      gratitudeFrequency: 0,
      goalsFrequency: 0,
    },
    sentimentBreakdown: {
      positive: 0,
      negative: 0,
      neutral: 0,
      mixed: 0,
    },
  };
}
