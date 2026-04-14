import { HardDrive, ShieldCheck, Brain, BookOpen, Wifi, Monitor } from "lucide-react";
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
];

export default function FeaturesGrid() {
  return (
    <section className="bg-[var(--background)] px-4 py-14">
      <div className="max-w-5xl mx-auto">
        <AnimatedReveal>
          <h2 className="text-center text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-10">
            What you get
          </h2>
        </AnimatedReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <AnimatedReveal key={feature.name} delay={i * 0.2}>
                <div className="bg-white/90 rounded-xl p-4 space-y-3 transition-transform duration-300 ease-in-out hover:scale-[1.015] hover:shadow-md hover:shadow-neutral-200/50">
                  <Icon className="w-7 h-7 text-primary-600" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-neutral-900">{feature.name}</h3>
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
