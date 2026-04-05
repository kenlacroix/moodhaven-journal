/**
 * AI Service for MoodHaven Journal
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
} from '../../types/ai';
import type { AppSettings } from '../../types/settings';
import { cleanTranscript } from '../utils/transcriptFormatter';

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
  // Gratitude
  {
    id: 'fallback-1',
    text: 'What are three things you\'re grateful for today, no matter how small?',
    category: 'gratitude',
    reasoning: 'Gratitude practice is universally beneficial.',
    relevance: 0.9,
  },
  {
    id: 'fallback-g2',
    text: 'Who made a positive difference in your life recently, and what did they do?',
    category: 'gratitude',
    reasoning: 'Recognizing others deepens connection and appreciation.',
    relevance: 0.8,
  },
  // Reflection
  {
    id: 'fallback-2',
    text: 'If you could give your future self one piece of advice, what would it be?',
    category: 'reflection',
    reasoning: 'Self-reflection helps build self-awareness.',
    relevance: 0.8,
  },
  {
    id: 'fallback-r2',
    text: 'What did today teach you that yesterday didn\'t?',
    category: 'reflection',
    reasoning: 'Daily reflection surfaces small but meaningful growth.',
    relevance: 0.75,
  },
  // Goals
  {
    id: 'fallback-3',
    text: 'What\'s one small step you can take today toward something you care about?',
    category: 'goals',
    reasoning: 'Small actions build momentum.',
    relevance: 0.7,
  },
  {
    id: 'fallback-go2',
    text: 'What would a "good enough" version of your day look like right now?',
    category: 'goals',
    reasoning: 'Reframing goals as achievable reduces pressure.',
    relevance: 0.7,
  },
  // Emotions
  {
    id: 'fallback-4',
    text: 'How are you really feeling right now? Take a moment to check in with yourself.',
    category: 'emotions',
    reasoning: 'Emotional awareness is the foundation of journaling.',
    relevance: 0.85,
  },
  {
    id: 'fallback-e2',
    text: 'What emotion has been most present for you today, and where do you feel it in your body?',
    category: 'emotions',
    reasoning: 'Linking emotions to physical sensations builds somatic awareness.',
    relevance: 0.8,
  },
  // Self-care
  {
    id: 'fallback-5',
    text: 'What brought you a moment of peace or joy recently?',
    category: 'self-care',
    reasoning: 'Recognizing positive moments builds resilience.',
    relevance: 0.75,
  },
  {
    id: 'fallback-sc2',
    text: 'What does your body or mind need most from you right now?',
    category: 'self-care',
    reasoning: 'Checking in with physical and mental needs promotes self-compassion.',
    relevance: 0.8,
  },
  // Exploration
  {
    id: 'fallback-ex1',
    text: 'If this chapter of your life had a title, what would it be?',
    category: 'exploration',
    reasoning: 'Narrative framing helps give meaning to experience.',
    relevance: 0.7,
  },
  {
    id: 'fallback-ex2',
    text: 'What\'s something you\'ve been avoiding thinking about? What would happen if you faced it on the page?',
    category: 'exploration',
    reasoning: 'Journaling is a safe space to explore difficult thoughts.',
    relevance: 0.75,
  },
];

export function getFallbackPrompts(count: number = 3): AIPrompt[] {
  const shuffled = [...FALLBACK_PROMPTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Build health-context prompts from Oura data — runs entirely locally,
 * no AI call required. Returns 1-3 prompts based on what data is available.
 * Requires at least 3 days of history before surfacing prompts.
 */
export function buildHealthContextPrompts(
  ctx: {
    sleepScore?: number | null;
    readinessScore?: number | null;
    stressSummary?: string | null;
    activityScore?: number | null;
  },
  historyDepth: number
): AIPrompt[] {
  if (historyDepth < 3) return [];

  const prompts: AIPrompt[] = [];

  // Sleep-based
  if (ctx.sleepScore != null) {
    if (ctx.sleepScore < 70) {
      prompts.push({
        id: 'health-sleep-poor',
        text: 'What helps you restore your energy on days when rest has been hard to come by?',
        category: 'self-care',
        reasoning: `Sleep score ${ctx.sleepScore} — below optimal range`,
        relevance: 0.9,
      });
    } else if (ctx.sleepScore >= 85) {
      prompts.push({
        id: 'health-sleep-great',
        text: 'You\'re well-rested today. What would you like to make of this energy?',
        category: 'goals',
        reasoning: `Sleep score ${ctx.sleepScore} — a great night`,
        relevance: 0.9,
      });
    }
  }

  // Stress-based (from yesterday's finalized data)
  if (ctx.stressSummary === 'stressful' || ctx.stressSummary === 'demanding') {
    prompts.push({
      id: 'health-stress-elevated',
      text: 'What\'s been weighing on you most lately, and what would it mean to set a little of it down?',
      category: 'emotions',
      reasoning: 'Stress levels have been elevated recently',
      relevance: 0.85,
    });
  } else if (ctx.stressSummary === 'restored') {
    prompts.push({
      id: 'health-stress-restored',
      text: 'Your body is in recovery mode today. What\'s been helping you feel restored?',
      category: 'reflection',
      reasoning: 'Recovery data shows you\'re in a good state',
      relevance: 0.8,
    });
  }

  // Readiness-based (fallback when no sleep/stress data)
  if (prompts.length === 0 && ctx.readinessScore != null) {
    if (ctx.readinessScore < 70) {
      prompts.push({
        id: 'health-readiness-low',
        text: 'What\'s one small, kind thing you could do for yourself today?',
        category: 'self-care',
        reasoning: 'Readiness is low — your body may need extra care',
        relevance: 0.8,
      });
    } else if (ctx.readinessScore >= 85) {
      prompts.push({
        id: 'health-readiness-high',
        text: 'You\'re feeling ready today. What intention would you like to carry into the day?',
        category: 'goals',
        reasoning: `Readiness score ${ctx.readinessScore} — you\'re primed`,
        relevance: 0.8,
      });
    }
  }

  // Trend prompt if 7+ days available
  if (historyDepth >= 7 && prompts.length < 3) {
    prompts.push({
      id: 'health-trend-reflect',
      text: 'Looking back over the past week, what patterns do you notice in how you\'ve been feeling?',
      category: 'reflection',
      reasoning: '7-day history available — a good time to look for patterns',
      relevance: 0.75,
    });
  }

  return prompts.slice(0, 3);
}

// ============================================
// TRANSCRIPT FORMATTING (Layer 2 & 3)
// ============================================

/**
 * System prompts used when formatting transcripts via LLM.
 */
export const TRANSCRIPT_FORMAT_PROMPTS = {
  standard: `You are a journal editor. Clean up this voice transcription into well-formatted journal prose:
- Fix grammar and punctuation
- Remove any remaining filler words
- Ensure natural paragraph flow
- Preserve the speaker's voice and meaning
- Do NOT add content that wasn't spoken
Return only the formatted text, no explanations.`,

  watch: `Clean up this short voice note into a concise journal entry. Fix grammar, remove fillers, preserve meaning. Return only the text.`,
} as const;

export type TranscriptFormatMode = keyof typeof TRANSCRIPT_FORMAT_PROMPTS;

export interface FormatTranscriptSettings {
  layer: 'local' | 'ollama' | 'openai';
  cloudConsentGiven: boolean;
  ollamaEndpoint?: string;
  ollamaModel?: string;
  openaiKey?: string;
}

export interface FormatTranscriptResult {
  formatted: string;
  source: 'ollama' | 'openai' | 'local';
}

/**
 * Format a transcript using the configured layer.
 *
 * Layer 1 (local): Always available — rule-based cleanup via cleanTranscript.
 * Layer 2 (ollama): Local LLM. Falls back to L1 on any error.
 * Layer 3 (openai): Cloud LLM. Requires explicit consent. Falls back to L1 on error.
 *
 * @throws Error with message 'CONSENT_REQUIRED' if layer is 'openai' and
 *         cloudConsentGiven is false.
 */
export async function formatTranscript(
  text: string,
  mode: TranscriptFormatMode,
  settings: FormatTranscriptSettings
): Promise<FormatTranscriptResult> {
  const { layer, cloudConsentGiven, ollamaEndpoint, ollamaModel, openaiKey } = settings;
  const systemPrompt = TRANSCRIPT_FORMAT_PROMPTS[mode];

  // ── Layer 1: always-on local cleanup ──────────────────────────────────────
  if (layer === 'local') {
    return { formatted: cleanTranscript(text), source: 'local' };
  }

  // ── Layer 2: Ollama local LLM ─────────────────────────────────────────────
  if (layer === 'ollama') {
    const endpoint = ollamaEndpoint || 'http://localhost:11434';
    const ollamaController = new AbortController();
    const ollamaTimeoutId = setTimeout(() => ollamaController.abort(), 15_000);
    try {
      const response = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel || 'llama2',
          prompt: `${systemPrompt}\n\nTranscription:\n${text}`,
          stream: false,
        }),
        signal: ollamaController.signal,
      });
      clearTimeout(ollamaTimeoutId);

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const MAX_BYTES = 1_048_576; // 1 MB
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_BYTES) {
          reader.cancel();
          throw new Error('Ollama response exceeded 1 MB size limit');
        }
        chunks.push(value);
      }
      const body = new TextDecoder().decode(
        chunks.reduce((acc, c) => { const merged = new Uint8Array(acc.length + c.length); merged.set(acc); merged.set(c, acc.length); return merged; }, new Uint8Array(0))
      );
      const data = JSON.parse(body) as { response: string };
      return { formatted: data.response.trim(), source: 'ollama' };
    } catch {
      clearTimeout(ollamaTimeoutId);
      // Fall back to L1 on any Ollama error (includes AbortError on timeout)
      return { formatted: cleanTranscript(text), source: 'local' };
    }
  }

  // ── Layer 3: OpenAI cloud ─────────────────────────────────────────────────
  if (!cloudConsentGiven) {
    throw new Error('CONSENT_REQUIRED');
  }

  if (!openaiKey) {
    // No key configured — fall back to L1
    return { formatted: cleanTranscript(text), source: 'local' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      throw new Error('INVALID_KEY');
    }

    if (!response.ok) {
      throw new Error(`OpenAI returned ${response.status}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const formatted = data.choices[0]?.message?.content?.trim() ?? cleanTranscript(text);
    return { formatted, source: 'openai' };
  } catch (err) {
    clearTimeout(timeoutId);
    // Timeout or any other error — fall back to L1
    return { formatted: cleanTranscript(text), source: 'local' };
  }
}
