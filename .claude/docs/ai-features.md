# AI Integration

## Privacy Rules (Non-Negotiable)
- Journal text content **NEVER** sent to external APIs
- Only anonymized metadata sent: mood scores, sentiment classification, frequency patterns, time-of-day patterns, aggregated stats, emotional categories (locally extracted)
- AI features **opt-in**, disabled by default, require explicit consent
- Support both OpenAI BYOK and local Ollama for maximum privacy

## Monetization Tiers
| Tier | Features | Price |
|------|----------|-------|
| Free | All local analytics | $0 |
| Pro | Full AI insights, prompts, weekly reflections | TBD |
| BYOK | User's own OpenAI key | $0 (user pays API) |

## Key Types

```typescript
interface AIPromptRequest {
  recentMoodAverage: number;
  moodTrend: 'improving' | 'stable' | 'declining';
  dominantEmotions: string[];
  entryFrequency: 'daily' | 'weekly' | 'sporadic';
  preferredTime: 'morning' | 'afternoon' | 'evening';
}

interface AISettings {
  enabled: boolean;                    // default: false
  apiKeySource: 'user' | 'subscription' | null;
  userApiKey: string | null;           // encrypted storage
  features: { contextualPrompts: boolean; wellnessInsights: boolean; weeklyReflections: boolean; };
  consent: { agreedToTerms: boolean; consentDate: Date | null; dataUsageUnderstood: boolean; };
}
```

## STT Architecture (whisper.cpp sidecar)
- Engine: whisper.cpp binary as Tauri sidecar (`bundle.externalBin`)
- Models: on-demand download from Hugging Face to `app_data_dir/models/`
- Audio: Web Audio API → temp WAV → sidecar → stdout text → insert at cursor → delete WAV
- 3-layer formatting pipeline: L1 (local rules) → L2 (Ollama) → L3 (OpenAI, explicit consent)
- Full details: `docs/speech-to-text.md`

## Model Sizes
| Model | Size | Quality |
|-------|------|---------|
| `ggml-tiny.en.bin` | ~75MB | Acceptable |
| `ggml-base.en.bin` | ~142MB | Good |
| `ggml-small.en.bin` | ~466MB | Very good |
| `ggml-medium.en.bin` | ~1.5GB | Excellent |
