import { HardDrive, ShieldCheck, Brain, BookOpen, Wifi, Monitor } from "lucide-react";
import AnimatedReveal from "./AnimatedReveal";

const FEATURES = [
  {
    icon: HardDrive,
    name: "Local-first, always",
    description:
      "Your data lives on your device. Nothing leaves unless you choose to sync.",
  },
  {
    icon: ShieldCheck,
    name: "AES-256 encryption",
    description:
      "Every entry encrypted before it touches storage. Not even we could read it.",
  },
  {
    icon: Brain,
    name: "AI insights, no cloud",
    description:
      "Mood patterns and writing prompts derived from metadata — never your words.",
  },
  {
    icon: BookOpen,
    name: "Multiple journals",
    description:
      "Separate spaces for work, personal, travel — each with its own color and emoji.",
  },
  {
    icon: Wifi,
    name: "Peer sync over LAN",
    description:
      "Sync across your own devices on the same network. No cloud account, no fees.",
  },
  {
    icon: Monitor,
    name: "Cross-platform",
    description:
      "Desktop on Windows, macOS, Linux. Web app on any browser. Wear OS for quick captures.",
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
