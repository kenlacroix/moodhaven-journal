import type { Metadata } from "next";
import { Monitor, Globe, Smartphone, Watch } from "lucide-react";
import AnimatedReveal from "@/components/AnimatedReveal";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Platform Availability",
  description:
    "What features are available on each platform — Desktop (Windows, macOS, Linux), Web browser, Android companion, and Wear OS watch.",
  alternates: { canonical: "https://www.moodhaven.app/platforms" },
  openGraph: {
    title: "Platform Availability — MoodHaven Journal",
    description:
      "Desktop has the full feature set. The browser app covers most of it. Android and Wear OS add watch integration.",
    url: "https://www.moodhaven.app/platforms",
    type: "website",
  },
};

const PLATFORMS = [
  {
    icon: Monitor,
    name: "Desktop",
    subtitle: "Windows · macOS · Linux",
    note: "Full feature set. Native Tauri app.",
    cta: { label: "Download", href: "/download" },
  },
  {
    icon: Globe,
    name: "Web",
    subtitle: "Any browser, no install",
    note: "Most features. Data lives in your browser's IndexedDB.",
    cta: { label: "Open app", href: "https://journal.moodhaven.app" },
  },
  {
    icon: Smartphone,
    name: "Android Phone",
    subtitle: "Companion bridge only",
    note: "Relays voice memos and mood signals from your Wear OS watch to your desktop. Not a standalone journal app.",
    cta: null,
  },
  {
    icon: Watch,
    name: "Wear OS",
    subtitle: "Voice capture + mood taps",
    note: "Record voice memos and send quick mood signals from your wrist. Requires the Android companion.",
    cta: null,
  },
];

type Availability = "yes" | "no" | "partial" | "planned";

interface FeatureRow {
  feature: string;
  desktop: Availability;
  web: Availability;
  android: Availability;
  wear: Availability;
  note?: string;
}

const FEATURE_GROUPS: { heading: string; rows: FeatureRow[] }[] = [
  {
    heading: "Journaling",
    rows: [
      { feature: "Write, edit, delete entries", desktop: "yes", web: "yes", android: "no", wear: "no" },
      { feature: "Multiple journals (books)", desktop: "yes", web: "yes", android: "no", wear: "no" },
      { feature: "Mood tracking (1–5)", desktop: "yes", web: "yes", android: "no", wear: "no" },
      { feature: "Tags, search, timeline", desktop: "yes", web: "yes", android: "no", wear: "no" },
      { feature: "Media attachments", desktop: "yes", web: "yes", android: "no", wear: "no" },
      { feature: "Time capsule entries", desktop: "yes", web: "yes", android: "no", wear: "no" },
    ],
  },
  {
    heading: "Security",
    rows: [
      { feature: "AES-256-GCM encryption", desktop: "yes", web: "yes", android: "no", wear: "no" },
      { feature: "2FA (TOTP)", desktop: "yes", web: "yes", android: "no", wear: "no" },
      {
        feature: "Hardware key (FIDO2 / YubiKey)",
        desktop: "yes",
        web: "no",
        android: "no",
        wear: "no",
        note: "WebAuthn (Face ID, Windows Hello, YubiKey) is planned for the web app.",
      },
      { feature: "Recovery key", desktop: "yes", web: "yes", android: "no", wear: "no" },
    ],
  },
  {
    heading: "Sync",
    rows: [
      {
        feature: "LAN peer sync",
        desktop: "yes",
        web: "no",
        android: "no",
        wear: "no",
        note: "Browser version requires a local bridge daemon — planned for a future phase.",
      },
      { feature: "WebDAV cloud sync", desktop: "yes", web: "yes", android: "no", wear: "no" },
      { feature: "Export / import", desktop: "yes", web: "yes", android: "no", wear: "no" },
    ],
  },
  {
    heading: "AI & Insights",
    rows: [
      { feature: "AI insights (mood metadata only)", desktop: "yes", web: "yes", android: "no", wear: "no" },
      { feature: "Writing prompts", desktop: "yes", web: "yes", android: "no", wear: "no" },
    ],
  },
  {
    heading: "Speech & Voice",
    rows: [
      {
        feature: "Local transcription (whisper.cpp)",
        desktop: "yes",
        web: "no",
        android: "no",
        wear: "no",
        note: "A WASM port is planned for the web app.",
      },
      {
        feature: "Voice memo from watch",
        desktop: "yes",
        web: "no",
        android: "partial",
        wear: "yes",
        note: "Desktop receives and transcribes. Watch records. Android phone is the relay.",
      },
    ],
  },
  {
    heading: "Health Integration",
    rows: [
      {
        feature: "Oura Ring health context",
        desktop: "yes",
        web: "no",
        android: "no",
        wear: "no",
        note: "Daily readiness, sleep, and stress data from the Oura API.",
      },
      {
        feature: "Oura-enhanced StillHaven pace",
        desktop: "yes",
        web: "no",
        android: "no",
        wear: "no",
      },
      {
        feature: "Mood tap from watch",
        desktop: "yes",
        web: "no",
        android: "partial",
        wear: "yes",
        note: "Desktop receives. Watch sends. Android phone is the relay.",
      },
      {
        feature: "Live watch HR (StillHaven Tier B)",
        desktop: "planned",
        web: "no",
        android: "partial",
        wear: "planned",
        note: "Desktop plumbing is designed. Blocked on watch-side Health Services work.",
      },
    ],
  },
  {
    heading: "StillHaven (Bilateral Sessions)",
    rows: [
      { feature: "Audio bilateral session", desktop: "yes", web: "yes", android: "no", wear: "no" },
      {
        feature: "Bio-adaptive pace (Oura)",
        desktop: "yes",
        web: "no",
        android: "no",
        wear: "no",
      },
    ],
  },
  {
    heading: "Other",
    rows: [
      { feature: "Notifications / reminders", desktop: "yes", web: "no", android: "no", wear: "no" },
      { feature: "In-app update checker", desktop: "yes", web: "no", android: "no", wear: "no" },
    ],
  },
];

function Badge({ status }: { status: Availability }) {
  if (status === "yes") {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold" aria-label="Available">
        ✓
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold" aria-label="Partial">
        ◑
      </span>
    );
  }
  if (status === "planned") {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-600 text-xs font-medium" aria-label="Planned">
        ···
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 text-neutral-300 text-base" aria-label="Not available">
      —
    </span>
  );
}

export default function PlatformsPage() {
  return (
    <main className="bg-[var(--background)] min-h-screen">
      {/* Hero */}
      <section className="bg-white border-b border-neutral-100 px-4 py-14">
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedReveal>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
              Where it runs
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
              Platform availability
            </h1>
            <p className="text-base text-neutral-600 leading-relaxed max-w-xl mx-auto">
              Desktop has the full feature set. The browser app covers most of it.
              Android and Wear OS add watch integration for voice captures and mood signals.
            </p>
          </AnimatedReveal>
        </div>
      </section>

      {/* Platform cards */}
      <section className="px-4 py-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLATFORMS.map((p, i) => {
            const Icon = p.icon;
            return (
              <AnimatedReveal key={p.name} delay={i * 0.1}>
                <div className="bg-white rounded-xl p-5 border border-neutral-100 flex flex-col gap-3 h-full">
                  <Icon className="w-6 h-6 text-primary-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{p.name}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">{p.subtitle}</p>
                  </div>
                  <p className="text-xs text-neutral-500 leading-relaxed flex-1">{p.note}</p>
                  {p.cta && (
                    p.cta.href.startsWith("http") ? (
                      <a
                        href={p.cta.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors"
                      >
                        {p.cta.label} →
                      </a>
                    ) : (
                      <Link
                        href={p.cta.href}
                        className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors"
                      >
                        {p.cta.label} →
                      </Link>
                    )
                  )}
                </div>
              </AnimatedReveal>
            );
          })}
        </div>
      </section>

      {/* Feature matrix */}
      <section className="px-4 pb-20">
        <div className="max-w-5xl mx-auto">
          <AnimatedReveal>
            <h2 className="text-lg font-semibold text-neutral-900 mb-6">Feature matrix</h2>
          </AnimatedReveal>

          {/* Legend */}
          <AnimatedReveal delay={0.05}>
            <div className="flex flex-wrap gap-4 mb-8 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <Badge status="yes" /> Available
              </span>
              <span className="flex items-center gap-1.5">
                <Badge status="partial" /> Partial (see note)
              </span>
              <span className="flex items-center gap-1.5">
                <Badge status="planned" /> Planned
              </span>
              <span className="flex items-center gap-1.5">
                <Badge status="no" /> Not available
              </span>
            </div>
          </AnimatedReveal>

          <div className="overflow-x-auto rounded-xl border border-neutral-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 w-1/2">Feature</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 whitespace-nowrap">Desktop</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500">Web</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 whitespace-nowrap">Android</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 whitespace-nowrap">Wear OS</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map((group) => (
                  <>
                    <tr key={group.heading} className="bg-neutral-50/60">
                      <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                        {group.heading}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.feature} className="border-t border-neutral-50 hover:bg-neutral-50/40 transition-colors">
                        <td className="px-4 py-3 text-neutral-700">
                          <span>{row.feature}</span>
                          {row.note && (
                            <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">{row.note}</p>
                          )}
                        </td>
                        <td className="text-center px-3 py-3"><Badge status={row.desktop} /></td>
                        <td className="text-center px-3 py-3"><Badge status={row.web} /></td>
                        <td className="text-center px-3 py-3"><Badge status={row.android} /></td>
                        <td className="text-center px-3 py-3"><Badge status={row.wear} /></td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <AnimatedReveal delay={0.1}>
            <p className="text-xs text-neutral-400 mt-4 leading-relaxed">
              Missing a feature on your platform?{" "}
              <Link href="/contribute" className="text-primary-600 hover:text-primary-800 transition-colors">
                Contributions are welcome.
              </Link>{" "}
              Platform availability is tracked in{" "}
              <a
                href="https://github.com/kenlacroix/moodhaven-journal/blob/main/PLATFORMS.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-800 transition-colors"
              >
                PLATFORMS.md
              </a>{" "}
              in the repository.
            </p>
          </AnimatedReveal>
        </div>
      </section>
    </main>
  );
}
