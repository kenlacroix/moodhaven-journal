import AnimatedReveal from "./AnimatedReveal";

const STEPS = [
  {
    number: "01",
    heading: "Download or open in browser",
    body: "Native desktop app on Windows, macOS, and Linux. Or open journal.moodhaven.app in any modern browser — no installation, no account form.",
  },
  {
    number: "02",
    heading: "Set a password — that's your key",
    body: "Your password is never stored or sent anywhere. It derives the encryption key in memory. No reset button. No support ticket. Only you can unlock your journal.",
  },
  {
    number: "03",
    heading: "Start writing. Nothing else required.",
    body: "No cloud setup. No storage picker. No email confirmation. Your first entry encrypts to disk in under a second. That's the whole onboarding.",
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-[var(--background)] px-4 py-20">
      <div className="max-w-5xl mx-auto">
        <AnimatedReveal>
          <p className="text-center text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            How it works
          </p>
          <h2 className="text-center text-2xl md:text-3xl font-bold text-neutral-900 mb-12">
            Up and writing in three steps
          </h2>
        </AnimatedReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <AnimatedReveal key={step.number} delay={i * 0.15}>
              <div className="bg-white/90 rounded-xl p-6 space-y-3 ring-1 ring-neutral-100">
                <p className="text-4xl font-bold text-primary-200">{step.number}</p>
                <h3 className="text-base font-semibold text-neutral-900">{step.heading}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{step.body}</p>
              </div>
            </AnimatedReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
