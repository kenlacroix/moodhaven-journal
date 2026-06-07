import { HardDrive, ShieldCheck, Brain, BookOpen, Wifi, Monitor, Tag, Clock, Mic } from "lucide-react";
import AnimatedReveal from "./AnimatedReveal";

const FEATURES = [
  {
    icon: HardDrive,
    name: "Local-first, always",
    description:
      "SQLite on your disk. No telemetry, no sync unless you opt in. Check the source — there's no network call in the entry save path.",
  },
  {
    icon: ShieldCheck,
    name: "AES-256-GCM encryption",
    description:
      "PBKDF2, 600k iterations, per-entry random salt. Keys derived in memory, never stored. Audit it yourself in crypto.ts.",
  },
  {
    icon: Brain,
    name: "AI from metadata, not your words",
    description:
      "Mood scores, time-of-day patterns, entry frequency — that's all the AI sees. Your journal text never leaves the device.",
  },
  {
    icon: BookOpen,
    name: "Multiple journals",
    description:
      "Named books with emoji and color. Work, personal, therapy — each filtered separately in the timeline and calendar.",
  },
  {
    icon: Wifi,
    name: "Peer sync over LAN",
    description:
      "Ed25519 device identity, QR/PIN pairing, AES-256-GCM transport. No cloud relay. A passive observer sees only ciphertext.",
  },
  {
    icon: Monitor,
    name: "Every platform",
    description:
      "Native desktop on Windows, macOS, Linux. Browser PWA at journal.moodhaven.app. Wear OS for voice captures from your wrist.",
  },
  {
    icon: Tag,
    name: "Activity tagging",
    description:
      "Tag entries with activities — Exercise, Reading, Social, Meditation and more. See which activities correlate with your best and worst moods in the Insights view.",
  },
  {
    icon: Clock,
    name: "Time Capsule",
    description:
      "Seal any entry until a future date. Revisit a letter to your future self when the date arrives — or let anniversary entries surface each year automatically.",
  },
  {
    icon: Mic,
    name: "Voice memos from your wrist",
    description:
      "Record a voice reflection on Wear OS. Whisper.cpp transcribes it locally on your desktop — no cloud STT, no audio ever leaves your devices.",
  },
];

export default function FeaturesGrid() {
  return (
    <section className="bg-[var(--background)] px-4 py-20">
      <div className="max-w-5xl mx-auto">
        <AnimatedReveal>
          <p className="text-center text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            What you get
          </p>
          <h2 className="text-center text-2xl md:text-3xl font-bold text-neutral-900 mb-12">
            Everything you need, nothing you don&apos;t
          </h2>
        </AnimatedReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <AnimatedReveal key={feature.name} delay={i * 0.2}>
                <div className="bg-white/90 rounded-xl p-4 space-y-3 transition-transform duration-300 ease-in-out hover:scale-[1.015] hover:shadow-md hover:shadow-neutral-200/50">
                  <Icon className="w-7 h-7 text-primary-600" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-neutral-900">{feature.name}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </AnimatedReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
