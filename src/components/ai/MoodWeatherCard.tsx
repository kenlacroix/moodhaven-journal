/**
 * MoodWeatherCard
 *
 * Visualises the user's emotional climate using a weather metaphor.
 * Computed 100% from local metadata — no AI/network required.
 */

import type { AggregatedMetadata } from '../../types/ai';

interface MoodWeatherCardProps {
  metadata: AggregatedMetadata;
}

interface WeatherInfo {
  emoji: string;
  label: string;
  description: string;
  gradient: string;
}

function getWeatherInfo(average: number): WeatherInfo {
  if (average >= 4.3) {
    return {
      emoji: '☀️',
      label: 'Radiant',
      description: 'Your mood has been really bright lately.',
      gradient: 'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20',
    };
  }
  if (average >= 3.5) {
    return {
      emoji: '🌤️',
      label: 'Mostly Sunny',
      description: 'Things are going well with occasional clouds.',
      gradient: 'from-sky-50 to-blue-50 dark:from-sky-950/20 dark:to-blue-950/20',
    };
  }
  if (average >= 2.8) {
    return {
      emoji: '⛅',
      label: 'Partly Cloudy',
      description: 'A mixed emotional landscape — some sun, some shade.',
      gradient: 'from-slate-50 to-blue-50 dark:from-slate-900/50 dark:to-blue-950/20',
    };
  }
  if (average >= 2.0) {
    return {
      emoji: '☁️',
      label: 'Cloudy',
      description: 'Things have felt heavy recently. That\'s okay.',
      gradient: 'from-slate-100 to-slate-50 dark:from-slate-900/50 dark:to-slate-800/30',
    };
  }
  return {
    emoji: '⛈️',
    label: 'Stormy',
    description: 'It sounds like a tough stretch. Be gentle with yourself.',
    gradient: 'from-slate-200 to-slate-100 dark:from-slate-900/80 dark:to-slate-800/50',
  };
}

function TrendArrow({ trend }: { trend: 'improving' | 'stable' | 'declining' }) {
  if (trend === 'improving') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
        </svg>
        Improving
      </span>
    );
  }
  if (trend === 'declining') {
    return (
      <span className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-400 font-medium">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
        </svg>
        Declining
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
      Stable
    </span>
  );
}

const EMOTION_LABELS: Record<string, string> = {
  anxious: '😰 Anxious',
  stressed: '😤 Stressed',
  hopeful: '🌱 Hopeful',
  grateful: '🙏 Grateful',
  sad: '😢 Sad',
  happy: '😊 Happy',
  angry: '😠 Angry',
  calm: '🌊 Calm',
  overwhelmed: '🌀 Overwhelmed',
  motivated: '🔥 Motivated',
  lonely: '🌧️ Lonely',
  loved: '💛 Loved',
  confused: '❓ Confused',
  confident: '💪 Confident',
};

export function MoodWeatherCard({ metadata }: MoodWeatherCardProps) {
  const weather = getWeatherInfo(metadata.moodStats.average);
  const topEmotions = metadata.emotionalProfile.recentIndicators.slice(0, 3);

  return (
    <div className={`rounded-2xl border border-slate-100 dark:border-slate-800 bg-gradient-to-br ${weather.gradient} p-6`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
        Your emotional climate · last 30 days
      </p>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-5xl leading-none">{weather.emoji}</span>
            <div>
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                {weather.label}
              </h2>
              <div className="text-sm mt-0.5">
                <TrendArrow trend={metadata.moodStats.trend} />
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-xs">
            {weather.description}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <span className="text-3xl font-light text-slate-700 dark:text-slate-200">
            {metadata.moodStats.average.toFixed(1)}
          </span>
          <span className="text-sm text-slate-400 dark:text-slate-500"> / 5</span>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            avg mood
          </p>
        </div>
      </div>

      {/* Sentiment bar */}
      <div className="mt-5">
        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
          <div
            className="bg-emerald-400 dark:bg-emerald-500 transition-all duration-500"
            style={{ width: `${metadata.sentimentBreakdown.positive * 100}%` }}
            title={`${Math.round(metadata.sentimentBreakdown.positive * 100)}% positive`}
          />
          <div
            className="bg-amber-300 dark:bg-amber-500 transition-all duration-500"
            style={{ width: `${metadata.sentimentBreakdown.mixed * 100}%` }}
            title={`${Math.round(metadata.sentimentBreakdown.mixed * 100)}% mixed`}
          />
          <div
            className="bg-slate-300 dark:bg-slate-600 transition-all duration-500"
            style={{ width: `${metadata.sentimentBreakdown.neutral * 100}%` }}
            title={`${Math.round(metadata.sentimentBreakdown.neutral * 100)}% neutral`}
          />
          <div
            className="bg-rose-300 dark:bg-rose-500 transition-all duration-500"
            style={{ width: `${metadata.sentimentBreakdown.negative * 100}%` }}
            title={`${Math.round(metadata.sentimentBreakdown.negative * 100)}% challenging`}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
          <span>{Math.round(metadata.sentimentBreakdown.positive * 100)}% positive</span>
          <span>{Math.round(metadata.sentimentBreakdown.negative * 100)}% challenging</span>
        </div>
      </div>

      {/* Top emotions */}
      {topEmotions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {topEmotions.map((emotion) => (
            <span
              key={emotion}
              className="text-xs px-2.5 py-1 rounded-full bg-white/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-white/80 dark:border-slate-700"
            >
              {EMOTION_LABELS[emotion] ?? emotion}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
