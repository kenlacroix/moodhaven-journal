import type { Metadata } from "next";
import {
  Type,
  BookOpen,
  Pin,
  LayoutTemplate,
  Paintbrush,
  Save,
  Smile,
  Tag,
  CalendarDays,
  TrendingUp,
  Activity,
  History,
  ShieldCheck,
  KeyRound,
  Hash,
  Lock,
  Fingerprint,
  Grid,
  EyeOff,
  Timer,
  Wifi,
  Cloud,
  FileDown,
  FileJson,
  Sparkles,
  MessageSquare,
  RefreshCw,
  UserCheck,
  Monitor,
  Globe,
  Watch,
  Mic,
  Waves,
} from "lucide-react";
import AnimatedReveal from "@/components/AnimatedReveal";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features — MoodHaven Journal",
  description:
    "Everything MoodHaven Journal does — writing tools, mood tracking, activity tagging, privacy features, peer sync, AI insights, and more. Free forever.",
  alternates: { canonical: "https://www.moodhaven.app/features" },
  openGraph: {
    title: "Features — MoodHaven Journal",
    description:
      "Everything MoodHaven Journal does — writing tools, mood tracking, activity tagging, privacy features, peer sync, AI insights, and more. Free forever.",
    url: "https://www.moodhaven.app/features",
    type: "website",
  },
};

interface FeatureItem {
  icon: React.ElementType;
  name: string;
  description: string;
}

interface FeatureCategory {
  heading: string;
  items: FeatureItem[];
}

const CATEGORIES: FeatureCategory[] = [
  {
    heading: "Writing",
    items: [
      {
        icon: Type,
        name: "Rich text editor",
        description: "TipTap-powered editor with headings, lists, bold, italic, inline code, links, and slash commands.",
      },
      {
        icon: BookOpen,
        name: "Multiple journals (Books)",
        description: "Organize entries into named books, each with its own emoji and color.",
      },
      {
        icon: Pin,
        name: "Entry pinning and status badges",
        description: "Pin important entries and mark them as Thinking, Complete, or Revisit.",
      },
      {
        icon: LayoutTemplate,
        name: "Templates",
        description: "Pick from built-in templates to start an entry with structure already in place.",
      },
      {
        icon: Paintbrush,
        name: "Writing appearance",
        description: "Adjust font, size, line height, tint color, and accessibility options per session.",
      },
      {
        icon: Save,
        name: "Auto-save",
        description: "Encrypts and writes to disk as you type — no manual save, no lost words.",
      },
    ],
  },
  {
    heading: "Mood & Tracking",
    items: [
      {
        icon: Smile,
        name: "5-level mood selector",
        description: "One tap per entry, always visible. Ranges from Very Low to Excellent.",
      },
      {
        icon: Tag,
        name: "Activity tagging",
        description: "Tag Exercise, Social, Reading, Meditation, Cooking, and 10 more predefined activities. Add up to 50 custom ones.",
      },
      {
        icon: CalendarDays,
        name: "Mood calendar heatmap",
        description: "Monthly calendar colored by daily average mood — spot patterns across weeks at a glance.",
      },
      {
        icon: TrendingUp,
        name: "Mood statistics",
        description: "Streaks, day-of-week patterns, and trend charts — all computed locally without any AI.",
      },
      {
        icon: Activity,
        name: "Activity-mood correlation",
        description: "The Insights view shows which activities correlate with your best and worst moods.",
      },
      {
        icon: History,
        name: "On This Day",
        description: "Resurface entries written on this same date in past years, automatically.",
      },
    ],
  },
  {
    heading: "Privacy & Security",
    items: [
      {
        icon: ShieldCheck,
        name: "AES-256-GCM encryption",
        description: "Keys are derived from your password and never stored. The backend only ever sees ciphertext.",
      },
      {
        icon: KeyRound,
        name: "Zero-knowledge design",
        description: "Even if the database file were extracted, its contents are unreadable without your password.",
      },
      {
        icon: Hash,
        name: "PBKDF2 key derivation",
        description: "600,000 iterations with a per-entry random salt — compromising one key exposes nothing else.",
      },
      {
        icon: Lock,
        name: "2FA",
        description: "TOTP authenticator app support plus FIDO2 hardware key (YubiKey) as a second factor.",
      },
      {
        icon: Fingerprint,
        name: "Biometric unlock",
        description: "OS keyring integration — Touch ID, Windows Hello, and Linux keyring for fast re-unlock.",
      },
      {
        icon: Grid,
        name: "PIN unlock",
        description: "Set a fast 4–6 digit PIN as an alternative to typing your full password on the lock screen.",
      },
      {
        icon: EyeOff,
        name: "Privacy modes",
        description: "Per-entry modes: Open, Mindful (hidden preview), or Private (fully blurred in the timeline).",
      },
      {
        icon: Timer,
        name: "Time Capsule",
        description: "Seal entries until a future date. Anniversary auto-reveals surface past entries on their date each year.",
      },
    ],
  },
  {
    heading: "Sync & Data",
    items: [
      {
        icon: Wifi,
        name: "Peer sync over LAN",
        description: "Ed25519 device identity, QR/PIN pairing, AES-256-GCM encrypted transport — no cloud relay required.",
      },
      {
        icon: Cloud,
        name: "WebDAV backup",
        description: "Encrypted export to your own WebDAV server. The server only ever receives ciphertext.",
      },
      {
        icon: FileDown,
        name: "Selective export",
        description: "Filter by tag, mood range, or date range before exporting — export exactly what you want.",
      },
      {
        icon: FileJson,
        name: "JSON and encrypted export",
        description: "Export as a portable .moodhaven encrypted backup or as plaintext JSON for your own tools.",
      },
    ],
  },
  {
    heading: "AI — opt-in, metadata only",
    items: [
      {
        icon: MessageSquare,
        name: "Contextual writing prompts",
        description: "Prompts based on mood patterns and entry frequency — your actual text is never analyzed.",
      },
      {
        icon: Sparkles,
        name: "Weekly reflection summaries",
        description: "Generated from mood metadata, not from the content of your entries.",
      },
      {
        icon: UserCheck,
        name: "Disabled by default",
        description: "All AI features require explicit opt-in. Nothing is sent anywhere without your consent.",
      },
      {
        icon: RefreshCw,
        name: "BYOK",
        description: "Bring your own OpenAI key, or point it at a local Ollama model — no subscription needed.",
      },
    ],
  },
  {
    heading: "Platform",
    items: [
      {
        icon: Monitor,
        name: "Native desktop",
        description: "Windows, macOS, and Linux via Tauri v2. Full feature set, native OS integration.",
      },
      {
        icon: Globe,
        name: "Browser / PWA",
        description: "Full-featured at journal.moodhaven.app using an IndexedDB backend. No install required.",
      },
      {
        icon: Watch,
        name: "Wear OS companion",
        description: "Capture voice memos from your wrist. Desktop receives, transcribes, and queues them as drafts.",
      },
      {
        icon: Mic,
        name: "Voice memos",
        description: "Offline transcription via a whisper.cpp sidecar — no cloud speech API, no audio leaves your device.",
      },
    ],
  },
  {
    heading: "Wellness",
    items: [
      {
        icon: Waves,
        name: "StillHaven",
        description: "Bilateral audio stimulation companion. Pre/post activation tracking and session history. Opt-in via Settings → Health.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <main id="main-content" className="bg-[var(--background)] px-4 pt-12 pb-20">
      <div className="max-w-4xl mx-auto">

        <AnimatedReveal>
          <p className="text-center text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            What&apos;s included
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 text-center mb-2">
            Features
          </h1>
          <p className="text-center text-neutral-500 text-base mb-10 max-w-lg mx-auto">
            Everything MoodHaven Journal ships with — writing tools, mood tracking, privacy features, and more.
          </p>
        </AnimatedReveal>

        {/* Free-forever callout */}
        <AnimatedReveal delay={0.05}>
          <div className="mb-12 rounded-xl bg-primary-50 ring-1 ring-primary-100 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary-900">Free forever. No Pro tier.</p>
              <p className="text-xs text-primary-700 mt-0.5">
                Every feature on this page ships to everyone. MIT licensed, no subscription, no upsell.
              </p>
            </div>
            <Link
              href="/faq#free"
              className="shrink-0 text-xs font-semibold text-primary-700 hover:underline whitespace-nowrap"
            >
              Why free? →
            </Link>
          </div>
        </AnimatedReveal>

        {/* Feature categories */}
        <div className="space-y-14">
          {CATEGORIES.map((category, catIdx) => (
            <AnimatedReveal key={category.heading} delay={catIdx * 0.04}>
              <section>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-5">
                  {category.heading}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {category.items.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <AnimatedReveal key={item.name} delay={catIdx * 0.04 + i * 0.05}>
                        <div className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-100 flex items-start gap-3 h-full">
                          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Icon className="w-4 h-4 text-primary-600" aria-hidden="true" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-neutral-900 mb-0.5">{item.name}</p>
                            <p className="text-sm text-neutral-500 leading-relaxed">{item.description}</p>
                          </div>
                        </div>
                      </AnimatedReveal>
                    );
                  })}
                </div>
              </section>
            </AnimatedReveal>
          ))}
        </div>

        {/* Bottom CTA */}
        <AnimatedReveal delay={0.15}>
          <div className="mt-16 text-center">
            <p className="text-sm text-neutral-500 mb-4">Ready to try it?</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/download"
                className="rounded-full bg-primary-700 text-white px-6 py-2.5 text-sm font-semibold hover:bg-primary-800 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60"
              >
                Download for Desktop
              </Link>
              <a
                href="https://journal.moodhaven.app"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-neutral-300 bg-white text-neutral-900 px-6 py-2.5 text-sm font-semibold hover:bg-neutral-50 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
              >
                Try in Browser
              </a>
            </div>
          </div>
        </AnimatedReveal>

      </div>
    </main>
  );
}
