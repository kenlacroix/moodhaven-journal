import type { Metadata } from "next";
import { ShieldCheck, Download, Smartphone, Coins, Code2, Users, Lock, FileCode2, Brain, Wifi, Terminal, Waves, BarChart2, Tag, Calendar, BookOpen, Clock } from "lucide-react";
import AnimatedReveal from "@/components/AnimatedReveal";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about MoodHaven Journal — how encryption works, which platforms are supported, whether it's really free, and how the open-source model works.",
  alternates: { canonical: "https://www.moodhaven.app/faq" },
  openGraph: {
    title: "FAQ — MoodHaven Journal",
    description:
      "Answers to common questions about privacy, encryption, platforms, and how MoodHaven Journal works.",
    url: "https://www.moodhaven.app/faq",
    type: "website",
  },
};

const QUESTIONS = [
  {
    icon: ShieldCheck,
    q: "How secure is my data?",
    a: "All your data is stored locally on your device, encrypted with AES-256-GCM before it ever touches disk. Nothing is uploaded or shared. Your journal entries never leave your machine unless you choose to export them. The web app stores entries in your browser's IndexedDB — same encryption, no cloud.",
  },
  {
    icon: Download,
    q: "Can I export my journal?",
    a: "Yes. You can export your entries as an encrypted .moodhaven backup file or as a plaintext file. Find it under Settings → Data Management.",
  },
  {
    icon: Smartphone,
    q: "Will there be a mobile app?",
    a: "The web app is available now at journal.moodhaven.app — it works on any device with a browser. A Wear OS companion for voice memos launched with v0.7.0, and LAN peer sync lets you keep multiple devices in sync without a cloud account.",
  },
  {
    icon: Coins,
    id: "free",
    q: "Is MoodHaven free?",
    a: "Yes — completely free, forever. MoodHaven is open source under the MIT license. There is no Pro tier, no subscription, and no paid features. Everything ships to everyone.",
  },
  {
    icon: Code2,
    q: "Is this really open source?",
    a: "Yes. Every line of code is on GitHub, MIT licensed. You can build it yourself, fork it, audit it, or contribute to it. No closed core, no open-core bait-and-switch.",
    link: { label: "View on GitHub", href: "https://github.com/kenlacroix/moodhaven-journal" },
  },
  {
    icon: Users,
    q: "How do I contribute?",
    a: "We'd love your help — pull requests, bug reports, documentation, and testing are all welcome. No code experience required to make a meaningful contribution.",
    link: { label: "Contribute guide", href: "/contribute" },
  },
];

const TECHNICAL = [
  {
    icon: Lock,
    q: "What encryption does MoodHaven use?",
    a: "AES-256-GCM with PBKDF2 key derivation (600,000 iterations). Each entry has its own random 16-byte salt — compromising one entry's key doesn't expose others. Keys are derived from your password in memory and never stored anywhere.",
  },
  {
    icon: FileCode2,
    q: "Can I verify the source code?",
    a: "Yes. MoodHaven is fully open source. The security model is documented in SECURITY.md.",
    links: [
      { label: "Repository on GitHub", href: "https://github.com/kenlacroix/moodhaven-journal" },
      { label: "SECURITY.md", href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/SECURITY.md" },
    ],
  },
  {
    icon: Brain,
    q: "How does AI work without sending my data?",
    a: "AI features analyze anonymized metadata only: mood scores, sentiment categories, time-of-day patterns, and entry frequency. Your actual journal text is never sent to any external API. AI is opt-in and disabled by default.",
  },
  {
    icon: Wifi,
    q: "What is peer sync and how secure is it?",
    a: "Peer sync connects your devices over your local network using an Ed25519 device identity and AES-256-GCM encrypted transport. No cloud intermediary. A passive observer on your network sees only ciphertext.",
    links: [{ label: "Architecture docs", href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/docs/architecture.md" }],
  },
  {
    icon: Terminal,
    q: "How do I install on Linux?",
    a: "Download the .AppImage from the Downloads page. Make it executable (chmod +x) and run it directly — no installation required. A .deb package is also available for Ubuntu-based distributions.",
    links: [{ label: "Downloads page", href: "/download" }],
  },
];

const MOOD_TRACKING = [
  {
    icon: BarChart2,
    q: "How does the mood tracker work?",
    a: "You select a mood level (1–5) for each journal entry — from Very Low to Excellent. The app uses these to build a mood calendar heatmap, streak stats, and day-of-week pattern charts. No AI required — all analytics run locally.",
  },
  {
    icon: Tag,
    q: "What is activity tagging?",
    a: "Activity tagging lets you link journal entries to activities — Exercise, Social, Reading, Meditation, Cooking, and more. 15 activities are predefined; you can add up to 50 custom ones. After a few weeks, the Insights view shows which activities correlate with your better or worse moods.",
  },
  {
    icon: Calendar,
    q: "What does the mood calendar show?",
    a: "The calendar view shows a monthly heatmap: each day is colored by your average mood for that day. Green for excellent, yellow for neutral, orange/red for low. It lets you spot patterns across weeks and months without reading through individual entries.",
  },
  {
    icon: BookOpen,
    q: 'What is "On This Day"?',
    a: "On This Day shows you entries written on this same date in previous years. It's a built-in way to see how far you've come or revisit a moment from a year ago — without having to search.",
  },
  {
    icon: Clock,
    q: "What is the Time Capsule?",
    a: "The Time Capsule lets you seal any entry until a future date. The entry is hidden from your timeline and search results until the date arrives. Useful for letters to your future self, anniversary memories, or anything you want to revisit later.",
  },
];

const STILLHAVEN = [
  {
    q: "What is StillHaven?",
    a: "StillHaven is a bilateral audio stimulation tool built into MoodHaven Journal. It plays alternating left-right tones — the same kind of rhythm your brain uses during deep sleep to process the day. Many people find it helps their nervous system settle, especially after stressful events, persistent anxiety, or times when they feel wound up but can't explain why.",
  },
  {
    q: "Is it safe to use on my own?",
    a: "StillHaven is a general wellness tool suitable for most people in everyday stress situations. It may not be appropriate if you are currently experiencing dissociation, flashbacks, or acute crisis. If you are working through significant past experiences, please consult a qualified mental health professional before using it — and ideally work alongside one rather than using StillHaven as a replacement.",
  },
  {
    q: "How is StillHaven different from professional guided sessions?",
    a: "A trained mental health professional using bilateral stimulation works with you to identify specific targets — a memory, a belief, a body sensation — and guides the processing. StillHaven provides the bilateral rhythm without that structure. It's a general settling tool, not a guided processing protocol. Think of it like the difference between a stretching routine and a clinical rehabilitation program: both are useful, but they aren't the same thing.",
  },
  {
    q: "What will I notice during a session?",
    a: "Responses vary. Some people notice physical sensations, a shift in how something feels, or thoughts that arise and pass. Others notice nothing obvious at all during the session but feel calmer afterward. Both are normal — the absence of a noticeable shift doesn't mean it isn't working. Consistent short sessions tend to produce more effect over time than occasional long ones.",
  },
];

export default function FAQPage() {
  return (
    <main id="main-content" className="bg-[var(--background)] px-4 pt-12 pb-20">
      <div className="max-w-3xl mx-auto">

        <AnimatedReveal>
          <p className="text-center text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            Help
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 text-center mb-2">
            Frequently Asked Questions
          </h1>
          <p className="text-center text-neutral-500 text-base mb-12 max-w-lg mx-auto">
            Everything you need to know about MoodHaven. Can&apos;t find your answer?{" "}
            <a
              href="https://github.com/kenlacroix/moodhaven-journal/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-700 hover:underline"
            >
              Open an issue on GitHub.
            </a>
          </p>
        </AnimatedReveal>

        {/* Common questions */}
        <AnimatedReveal delay={0.05}>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-5">Common questions</p>
          <div className="space-y-3 mb-12">
            {QUESTIONS.map((item, i) => {
              const Icon = item.icon;
              return (
                <AnimatedReveal key={item.q} delay={i * 0.06}>
                  <div id={"id" in item ? item.id : undefined} className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-100 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-primary-600" aria-hidden="true" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-sm font-semibold text-neutral-900 mb-1">{item.q}</h2>
                        <p className="text-sm text-neutral-600 leading-relaxed">{item.a}</p>
                        {"link" in item && item.link && (
                          <a
                            href={item.link.href}
                            target={item.link.href.startsWith("http") ? "_blank" : undefined}
                            rel={item.link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary-700 hover:underline"
                          >
                            {item.link.label}
                            <span aria-hidden="true">{item.link.href.startsWith("http") ? " ↗" : " →"}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </AnimatedReveal>
              );
            })}
          </div>
        </AnimatedReveal>

        {/* Technical questions */}
        <AnimatedReveal delay={0.1}>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-5">Technical details</p>
          <div className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200 overflow-hidden">
            {TECHNICAL.map((item) => {
              const Icon = item.icon;
              return (
                <details key={item.q} className="group bg-white/90">
                  <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none list-none hover:bg-primary-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none">
                    <Icon className="w-4 h-4 text-primary-600 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-sm font-medium text-neutral-900">{item.q}</span>
                    <span className="text-neutral-400 group-open:rotate-180 transition-transform duration-200 text-xs" aria-hidden="true">▾</span>
                  </summary>
                  <div className="px-5 pb-5 pt-1 pl-12 text-sm text-neutral-600 leading-relaxed space-y-2">
                    <p>{item.a}</p>
                    {"links" in item && item.links && (
                      <div className="flex flex-wrap gap-3 mt-2">
                        {item.links.map((l) => (
                          <a
                            key={l.href}
                            href={l.href}
                            target={l.href.startsWith("http") ? "_blank" : undefined}
                            rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                            className="text-xs font-semibold text-primary-700 hover:underline"
                          >
                            {l.label}{l.href.startsWith("http") ? " ↗" : " →"}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </AnimatedReveal>

        {/* Mood & Activity Tracking questions */}
        <AnimatedReveal delay={0.11}>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-5 mt-12">Mood &amp; Activity Tracking</p>
          <div className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200 overflow-hidden">
            {MOOD_TRACKING.map((item) => {
              const Icon = item.icon;
              return (
                <details key={item.q} className="group bg-white/90">
                  <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none list-none hover:bg-primary-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none">
                    <Icon className="w-4 h-4 text-primary-600 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-sm font-medium text-neutral-900">{item.q}</span>
                    <span className="text-neutral-400 group-open:rotate-180 transition-transform duration-200 text-xs" aria-hidden="true">▾</span>
                  </summary>
                  <div className="px-5 pb-5 pt-1 pl-12 text-sm text-neutral-600 leading-relaxed">
                    <p>{item.a}</p>
                  </div>
                </details>
              );
            })}
          </div>
        </AnimatedReveal>

        {/* StillHaven questions */}
        <AnimatedReveal delay={0.12}>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-5 mt-12">StillHaven — bilateral sessions</p>
          <div className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200 overflow-hidden mb-4">
            {STILLHAVEN.map((item) => (
              <details key={item.q} className="group bg-white/90">
                <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none list-none hover:bg-primary-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none">
                  <Waves className="w-4 h-4 text-primary-600 flex-shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-sm font-medium text-neutral-900">{item.q}</span>
                  <span className="text-neutral-400 group-open:rotate-180 transition-transform duration-200 text-xs" aria-hidden="true">▾</span>
                </summary>
                <div className="px-5 pb-5 pt-1 pl-12 text-sm text-neutral-600 leading-relaxed">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed px-1">
            StillHaven is a wellness tool, not a medical device. It is not a substitute for professional mental health support.
            If you are working through significant distress, please work with a qualified professional.
          </p>
        </AnimatedReveal>

        {/* Footer CTA */}
        <AnimatedReveal delay={0.15}>
          <div className="mt-12 text-center">
            <p className="text-sm text-neutral-500 mb-4">Ready to get started?</p>
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
