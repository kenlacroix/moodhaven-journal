/**
 * AI Service for MoodBloom
 *
 * PRIVACY-FIRST ARCHITECTURE:
 * - Only sends aggregated metadata to AI APIs
 * - Never sends actual journal content
 * - Supports both OpenAI (cloud) and Ollama (local)
 */

import type {
  AggregatedMetadata,
  AIPrompt,
  WellnessInsight,
  WeeklyReflection,
  RecurringPattern,
  AIResponse,
} from '../types/ai';
import type { AppSettings } from '../types/settings';

// ============================================
// AI SERVICE CONFIGURATION
// ============================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface AIServiceConfig {
  provider: 'openai' | 'local' | 'none';
  openaiKey?: string;
  openaiModel?: string;
  localEndpoint?: string;
  localModel?: string;
}

// ============================================
// PROMPT TEMPLATES
// ============================================

function buildPromptGenerationPrompt(
  metadata: AggregatedMetadata,
  count: number,
  healthModifiers: string[] = []
): string {
  const healthSection = healthModifiers.length > 0
    ? `\nTODAY'S HEALTH CONTEXT (qualitative only, no raw biometrics):\n${healthModifiers.map(m => `- ${m}`).join('\n')}\n`
    : '';

  return `You are a compassionate journaling assistant. Based on the user's journaling patterns (NOT their actual journal content), generate ${count} thoughtful writing prompts.

USER'S JOURNALING PATTERNS (anonymized metadata only):
- Average mood: ${metadata.moodStats.average}/5 (${metadata.moodStats.trend} trend)
- Recent mood: ${metadata.moodStats.recentAverage}/5 (last 7 days)
- Mood volatility: ${metadata.moodStats.volatility}
- Dominant emotions recently: ${metadata.emotionalProfile.recentIndicators.join(', ') || 'none detected'}
- Journaling frequency: ${metadata.patterns.frequency}
- Current streak: ${metadata.patterns.currentStreak} days
- Best day for journaling: ${metadata.patterns.bestDayOfWeek}
- Gratitude mentions: ${Math.round(metadata.emotionalProfile.gratitudeFrequency * 100)}% of entries
- Goal mentions: ${Math.round(metadata.emotionalProfile.goalsFrequency * 100)}% of entries
${healthSection}
Generate prompts that are:
1. Relevant to their emotional patterns${healthModifiers.length > 0 ? ' and today\'s physical state' : ''}
2. Encouraging but not dismissive of struggles
3. Varied in category (gratitude, reflection, goals, emotions, self-care)
${healthModifiers.length > 0 ? '4. Sensitive to the user\'s energy and stress levels today\n' : ''}
Respond in JSON format:
{
  "prompts": [
    {
      "text": "The prompt text as a question or invitation",
      "category": "gratitude|reflection|goals|emotions|self-care|exploration",
      "reasoning": "Brief explanation why this prompt is relevant (1 sentence)"
    }
  ]
}`;
}

function buildInsightsPrompt(metadata: AggregatedMetadata): string {
  return `You are a supportive wellness companion. Based on the user's journaling patterns (NOT their actual content), provide gentle insights.

USER'S PATTERNS (anonymized metadata only):
- ${metadata.totalEntries} entries over ${metadata.periodDays} days
- Average mood: ${metadata.moodStats.average}/5, trending ${metadata.moodStats.trend}
- Mood distribution: Great(5): ${metadata.moodStats.distribution[5]}, Good(4): ${metadata.moodStats.distribution[4]}, Okay(3): ${metadata.moodStats.distribution[3]}, Low(2): ${metadata.moodStats.distribution[2]}, Struggling(1): ${metadata.moodStats.distribution[1]}
- Best day: ${metadata.patterns.bestDayOfWeek}, Challenging day: ${metadata.patterns.worstDayOfWeek}
- Preferred journaling time: ${metadata.patterns.bestTimeOfDay}
- Current streak: ${metadata.patterns.currentStreak}, Longest: ${metadata.patterns.longestStreak}
- Dominant emotions: ${metadata.emotionalProfile.dominantIndicators.join(', ') || 'varied'}
- Sentiment breakdown: ${Math.round(metadata.sentimentBreakdown.positive * 100)}% positive, ${Math.round(metadata.sentimentBreakdown.negative * 100)}% challenging

Generate 2-4 insights that are:
1. Observational, not prescriptive
2. Celebrate positive patterns
3. Gently acknowledge challenges without being alarming
4. Actionable when appropriate

Respond in JSON format:
{
  "insights": [
    {
      "type": "observation|suggestion|celebration|pattern",
      "title": "Short title (3-5 words)",
      "message": "The insight message (1-2 sentences)",
      "basedOn": "What data this is based on",
      "priority": "low|medium|high"
    }
  ]
}`;
}

function buildWeeklyReflectionPrompt(
  metadata: AggregatedMetadata,
  weekStart: string,
  weekEnd: string
): string {
  return `Generate a weekly reflection summary based on journaling patterns.

WEEK: ${weekStart} to ${weekEnd}
PATTERNS:
- Entries this week: ${metadata.totalEntries}
- Average mood: ${metadata.moodStats.average}/5
- Mood trend: ${metadata.moodStats.trend}
- Dominant emotions: ${metadata.emotionalProfile.recentIndicators.join(', ') || 'varied'}
- Gratitude frequency: ${Math.round(metadata.emotionalProfile.gratitudeFrequency * 100)}%

Generate a brief, encouraging weekly summary with reflection prompts.

Respond in JSON format:
{
  "highlights": ["2-3 positive observations about their week"],
  "reflectionPrompts": ["2-3 questions for deeper reflection"],
  "focusSuggestion": "One gentle suggestion for the coming week"
}`;
}

// ============================================
// API CALLS
// ============================================

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful, compassionate journaling assistant. Always respond in valid JSON format.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callOllama(
  endpoint: string,
  model: string,
  prompt: string
): Promise<string> {
  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: `You are a helpful, compassionate journaling assistant. Always respond in valid JSON format.\n\nUser: ${prompt}`,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.response;
}

async function callAI(config: AIServiceConfig, prompt: string): Promise<string> {
  if (config.provider === 'openai' && config.openaiKey) {
    return callOpenAI(config.openaiKey, config.openaiModel || 'gpt-4o-mini', prompt);
  }

  if (config.provider === 'local' && config.localEndpoint) {
    return callOllama(config.localEndpoint, config.localModel || 'llama2', prompt);
  }

  throw new Error('AI provider not configured');
}

function parseJSONResponse<T>(response: string): T {
  // Try to extract JSON from the response (handle markdown code blocks)
  const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) ||
                    response.match(/```\n?([\s\S]*?)\n?```/) ||
                    [null, response];

  const jsonStr = jsonMatch[1] || response;
  return JSON.parse(jsonStr.trim());
}

// ============================================
// PUBLIC API
// ============================================

export function createAIServiceConfig(settings: AppSettings): AIServiceConfig {
  return {
    provider: settings.ai.enabled ? settings.ai.provider : 'none',
    openaiKey: settings.ai.openai.apiKey || undefined,
    openaiModel: settings.ai.openai.model,
    localEndpoint: settings.ai.localAI.endpoint,
    localModel: settings.ai.localAI.model,
  };
}

/**
 * Generate journal prompts based on user patterns.
 * healthModifiers: qualitative health labels (NOT raw biometrics) from Oura.
 */
export async function generatePrompts(
  config: AIServiceConfig,
  metadata: AggregatedMetadata,
  count: number = 3,
  healthModifiers: string[] = []
): Promise<AIResponse<AIPrompt[]>> {
  if (config.provider === 'none') {
    return { success: false, error: 'AI is not enabled' };
  }

  try {
    const prompt = buildPromptGenerationPrompt(metadata, count, healthModifiers);
    const response = await callAI(config, prompt);
    const parsed = parseJSONResponse<{ prompts: Array<Omit<AIPrompt, 'id' | 'relevance'>> }>(response);

    const prompts: AIPrompt[] = parsed.prompts.map((p, i) => ({
      id: `prompt-${Date.now()}-${i}`,
      text: p.text,
      category: p.category,
      reasoning: p.reasoning,
      relevance: 1 - i * 0.1, // First prompts are most relevant
    }));

    return { success: true, data: prompts };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate prompts',
    };
  }
}

/**
 * Generate wellness insights based on patterns
 */
export async function generateInsights(
  config: AIServiceConfig,
  metadata: AggregatedMetadata
): Promise<AIResponse<WellnessInsight[]>> {
  if (config.provider === 'none') {
    return { success: false, error: 'AI is not enabled' };
  }

  try {
    const prompt = buildInsightsPrompt(metadata);
    const response = await callAI(config, prompt);
    const parsed = parseJSONResponse<{ insights: Array<Omit<WellnessInsight, 'id' | 'actionable'>> }>(response);

    const insights: WellnessInsight[] = parsed.insights.map((i, idx) => ({
      id: `insight-${Date.now()}-${idx}`,
      type: i.type,
      title: i.title,
      message: i.message,
      basedOn: i.basedOn,
      priority: i.priority,
      actionable: i.type === 'suggestion',
    }));

    return { success: true, data: insights };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate insights',
    };
  }
}

/**
 * Generate weekly reflection
 */
export async function generateWeeklyReflection(
  config: AIServiceConfig,
  metadata: AggregatedMetadata,
  weekStart: string,
  weekEnd: string
): Promise<AIResponse<WeeklyReflection>> {
  if (config.provider === 'none') {
    return { success: false, error: 'AI is not enabled' };
  }

  try {
    const prompt = buildWeeklyReflectionPrompt(metadata, weekStart, weekEnd);
    const response = await callAI(config, prompt);
    const parsed = parseJSONResponse<{
      highlights: string[];
      reflectionPrompts: string[];
      focusSuggestion: string;
    }>(response);

    const reflection: WeeklyReflection = {
      weekStart,
      weekEnd,
      summary: {
        moodAverage: metadata.moodStats.average,
        moodTrend: metadata.moodStats.trend === 'improving' ? 'up' :
                   metadata.moodStats.trend === 'declining' ? 'down' : 'stable',
        entryCount: metadata.totalEntries,
        dominantEmotions: metadata.emotionalProfile.recentIndicators,
      },
      highlights: parsed.highlights,
      reflectionPrompts: parsed.reflectionPrompts,
      focusSuggestion: parsed.focusSuggestion,
    };

    return { success: true, data: reflection };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate reflection',
    };
  }
}

// ============================================
// OFFLINE PATTERN DETECTION (No AI needed)
// ============================================

/**
 * Detect recurring patterns locally without AI
 */
export function detectRecurringPatterns(metadata: AggregatedMetadata): RecurringPattern[] {
  const patterns: RecurringPattern[] = [];

  // Weekly mood pattern
  if (metadata.patterns.bestDayOfWeek !== metadata.patterns.worstDayOfWeek) {
    patterns.push({
      id: 'weekly-mood-pattern',
      type: 'weekly_pattern',
      description: `Your mood tends to be highest on ${metadata.patterns.bestDayOfWeek}s and lowest on ${metadata.patterns.worstDayOfWeek}s.`,
      confidence: 0.7,
      frequency: 'Weekly',
      suggestion: `Consider scheduling challenging tasks for ${metadata.patterns.bestDayOfWeek}s when your energy is typically higher.`,
    });
  }

  // Journaling time pattern
  if (metadata.patterns.bestTimeOfDay) {
    patterns.push({
      id: 'time-preference',
      type: 'positive_habit',
      description: `You tend to journal most in the ${metadata.patterns.bestTimeOfDay}.`,
      confidence: 0.8,
      frequency: 'Daily pattern',
    });
  }

  // Gratitude habit
  if (metadata.emotionalProfile.gratitudeFrequency > 0.5) {
    patterns.push({
      id: 'gratitude-habit',
      type: 'positive_habit',
      description: `You mention gratitude in ${Math.round(metadata.emotionalProfile.gratitudeFrequency * 100)}% of your entries.`,
      confidence: 0.9,
      frequency: 'Regular',
    });
  }

  // Mood volatility pattern
  if (metadata.moodStats.volatility === 'high') {
    patterns.push({
      id: 'mood-volatility',
      type: 'mood_cycle',
      description: 'Your mood shows significant day-to-day variation.',
      confidence: 0.75,
      frequency: 'Ongoing',
      suggestion: 'Consistent routines and self-care practices may help stabilize mood.',
    });
  }

  // Streak celebration
  if (metadata.patterns.currentStreak >= 7) {
    patterns.push({
      id: 'streak-celebration',
      type: 'positive_habit',
      description: `Amazing! You've journaled for ${metadata.patterns.currentStreak} days in a row.`,
      confidence: 1.0,
      frequency: 'Current streak',
    });
  }

  return patterns;
}

// ============================================
// FALLBACK PROMPTS (When AI is unavailable)
// ============================================

const FALLBACK_PROMPTS: AIPrompt[] = [
  {
    id: 'fallback-1',
    text: 'What are three things you\'re grateful for today, no matter how small?',
    category: 'gratitude',
    reasoning: 'Gratitude practice is universally beneficial.',
    relevance: 0.9,
  },
  {
    id: 'fallback-2',
    text: 'If you could give your future self one piece of advice, what would it be?',
    category: 'reflection',
    reasoning: 'Self-reflection helps build self-awareness.',
    relevance: 0.8,
  },
  {
    id: 'fallback-3',
    text: 'What\'s one small step you can take today toward something you care about?',
    category: 'goals',
    reasoning: 'Small actions build momentum.',
    relevance: 0.7,
  },
  {
    id: 'fallback-4',
    text: 'How are you really feeling right now? Take a moment to check in with yourself.',
    category: 'emotions',
    reasoning: 'Emotional awareness is the foundation of journaling.',
    relevance: 0.85,
  },
  {
    id: 'fallback-5',
    text: 'What brought you a moment of peace or joy recently?',
    category: 'self-care',
    reasoning: 'Recognizing positive moments builds resilience.',
    relevance: 0.75,
  },
];

export function getFallbackPrompts(count: number = 3): AIPrompt[] {
  // Shuffle and return requested count
  const shuffled = [...FALLBACK_PROMPTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
