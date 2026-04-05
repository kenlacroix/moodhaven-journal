import AnimatedReveal from "./AnimatedReveal";

const ITEMS = [
  {
    emoji: "🔑",
    label: "Zero-knowledge",
    body: "Your password is never stored or transmitted. Keys are derived in memory and cleared on lock.",
  },
  {
    emoji: "🚫",
    label: "No accounts",
    body: "No email required. No tracking. No ads. Ever.",
  },
  {
    emoji: "📖",
    label: "Open source",
    body: "Every line of code is public on GitHub. You don't have to trust our privacy claims — you can verify them.",
    href: "https://github.com/kenlacroix/moodhaven-journal",
  },
];

export default function PrivacyCallout() {
  return (
    <section className="bg-[var(--background)] px-4 py-12">
      <AnimatedReveal>
        <div className="max-w-5xl mx-auto bg-primary-50 rounded-2xl px-6 py-10">
          <h2 className="sr-only">Privacy at the core</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {ITEMS.map((item, i) => (
              <AnimatedReveal key={item.label} delay={i * 0.1}>
                <div className="space-y-2">
                  <div className="text-3xl" aria-hidden="true">{item.emoji}</div>
                  <h3 className="text-sm font-semibold text-primary-700 uppercase tracking-wide">
                    {item.label}
                  </h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {item.href ? (
                      <>
                        Every line of code is public on{" "}
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-primary-700 focus-visible:ring-1 focus-visible:ring-primary-700 rounded"
                        >
                          GitHub
                        </a>
                        . You don&apos;t have to trust our privacy claims — you can verify them.
                      </>
                    ) : (
                      item.body
                    )}
                  </p>
                </div>
              </AnimatedReveal>
            ))}
          </div>
        </div>
      </AnimatedReveal>
    </section>
  );
}
