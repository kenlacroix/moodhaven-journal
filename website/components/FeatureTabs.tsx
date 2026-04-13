// components/FeatureTabs.tsx
"use client";

import { useState } from "react";
import { ShieldCheck, Brain, Wifi, Monitor } from "lucide-react";
import AnimatedReveal from "./AnimatedReveal";

const TABS = [
  {
    id: "privacy",
    label: "Privacy",
    icon: ShieldCheck,
    headline: "Zero-knowledge by design",
    body: "Your journal text never leaves your device. All encryption and decryption happens in the browser or desktop app using AES-256-GCM with PBKDF2-derived keys. The Rust backend stores and retrieves opaque ciphertext — it never sees plaintext.",
    details: [
      { term: "Cipher", value: "AES-256-GCM" },
      { term: "Key derivation", value: "PBKDF2-HMAC-SHA256, 600k iterations" },
      { term: "Salt", value: "16 bytes, per-entry random" },
      { term: "Key storage", value: "In-memory only, cleared on lock" },
      { term: "Cloud required", value: "Never" },
    ],
    cta: { label: "Audit the source", href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/src/lib/services/crypto.ts" },
  },
  {
    id: "insights",
    label: "AI Insights",
    icon: Brain,
    headline: "AI from metadata, not your words",
    body: "The AI sees mood scores, time-of-day patterns, entry frequency, and emotional categories extracted locally — never the text of your entries. Insights run with your own OpenAI key or a local Ollama model. Your journal content never leaves the device.",
    details: [
      { term: "Text sent to AI", value: "None" },
      { term: "Metadata sent", value: "Mood scores, patterns, frequency" },
      { term: "AI provider", value: "Your OpenAI key or local Ollama" },
      { term: "Default state", value: "Disabled — explicit opt-in required" },
      { term: "Local fallback", value: "All analytics run without AI" },
    ],
    cta: { label: "Read the privacy model", href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/SECURITY.md" },
  },
  {
    id: "sync",
    label: "Peer Sync",
    icon: Wifi,
    headline: "Device-to-device, no cloud relay",
    body: "Sync between your own devices over your local network. Ed25519 device identity, QR/PIN pairing, and AES-256-GCM encrypted transport. A passive observer on your LAN sees only ciphertext — no journal content, no passwords.",
    details: [
      { term: "Relay server", value: "None — LAN direct" },
      { term: "Transport", value: "AES-256-GCM, per-frame random nonce" },
      { term: "Device identity", value: "Ed25519 key pair" },
      { term: "Pairing", value: "6-digit PIN + QR code, out-of-band" },
      { term: "Discovery", value: "mDNS / DNS-SD (_moodhaven._tcp.local)" },
    ],
    cta: { label: "Read the sync security model", href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/docs/peer-sync-security.md" },
  },
  {
    id: "platforms",
    label: "Platforms",
    icon: Monitor,
    headline: "Every screen you use",
    body: "Native desktop app on Windows, macOS, and Linux. A full-featured web app at journal.moodhaven.app — same codebase, same encryption, runs in any modern browser. A Wear OS companion for voice reflections from your wrist.",
    details: [
      { term: "Windows", value: "MSI + NSIS installer, WebView2" },
      { term: "macOS", value: "DMG, Intel + Apple Silicon" },
      { term: "Linux", value: "AppImage + .deb, Ubuntu 22.04+" },
      { term: "Browser", value: "journal.moodhaven.app — IndexedDB backend" },
      { term: "Wear OS", value: "Voice memos, mood taps, transferred to desktop" },
    ],
    cta: { label: "Download for desktop", href: "/download" },
  },
];

export default function FeatureTabs() {
  const [active, setActive] = useState(TABS[0].id);

  const tab = TABS.find((t) => t.id === active) ?? TABS[0];
  const Icon = tab.icon;

  return (
    <section className="bg-[var(--background)] px-4 py-14">
      <div className="max-w-5xl mx-auto">
        <AnimatedReveal>
          <h2 className="text-center text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-10">
            How it works
          </h2>
        </AnimatedReveal>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Feature categories"
          className="flex gap-2 flex-wrap justify-center mb-8"
        >
          {TABS.map((t) => {
            const TabIcon = t.icon;
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${t.id}`}
                onClick={() => setActive(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60 ${
                  isActive
                    ? "bg-primary-700 text-white shadow"
                    : "bg-white text-neutral-600 border border-neutral-200 hover:bg-primary-50 hover:text-primary-700"
                }`}
              >
                <TabIcon className="w-4 h-4" aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div
          id={`tabpanel-${tab.id}`}
          role="tabpanel"
          aria-label={tab.label}
          className="bg-white/90 rounded-xl ring-1 ring-neutral-100 overflow-hidden"
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Left: narrative */}
            <div className="p-6 md:p-8 border-b md:border-b-0 md:border-r border-neutral-100">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary-600" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 mb-3">
                {tab.headline}
              </h3>
              <p className="text-sm text-neutral-600 leading-relaxed mb-6">
                {tab.body}
              </p>
              <a
                href={tab.cta.href}
                target={tab.cta.href.startsWith("http") ? "_blank" : undefined}
                rel={tab.cta.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700 rounded"
              >
                {tab.cta.label}
                <span aria-hidden="true">{tab.cta.href.startsWith("http") ? "↗" : "→"}</span>
              </a>
            </div>

            {/* Right: spec table */}
            <div className="p-6 md:p-8">
              <dl className="space-y-4">
                {tab.details.map((d) => (
                  <div key={d.term} className="grid grid-cols-[130px_1fr] gap-2 text-sm">
                    <dt className="text-neutral-400 font-medium pt-0.5">{d.term}</dt>
                    <dd className="text-neutral-700">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
