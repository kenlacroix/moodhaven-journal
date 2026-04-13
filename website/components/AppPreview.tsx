// components/AppPreview.tsx
import Image from "next/image";
import AnimatedReveal from "./AnimatedReveal";

const CALLOUTS = [
  {
    label: "Mood selector",
    description: "One tap to log how you feel. Five levels, always visible.",
  },
  {
    label: "Rich text editor",
    description: "TipTap-powered: headings, lists, bold, inline code. Yours locally.",
  },
  {
    label: "Auto-save",
    description: "Writes to encrypted SQLite the moment you pause. No manual save.",
  },
  {
    label: "Multiple journals",
    description: "Named books with emoji and color. Work, personal, therapy — separate.",
  },
];

export default function AppPreview() {
  return (
    <section className="bg-[var(--background)] px-4 py-14">
      <div className="max-w-5xl mx-auto">
        <AnimatedReveal>
          <h2 className="text-center text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-3">
            See it in action
          </h2>
          <p className="text-center text-neutral-500 text-sm mb-10 max-w-md mx-auto">
            The writing view — where you spend most of your time.
          </p>
        </AnimatedReveal>

        <AnimatedReveal delay={0.1}>
          <div className="rounded-xl overflow-hidden shadow-xl shadow-neutral-200/60 ring-1 ring-neutral-200">
            <Image
              src="/images/writing-view.png"
              alt="MoodHaven Journal writing view — mood selector at top, rich text editor, book switcher in sidebar"
              width={960}
              height={640}
              className="w-full h-auto"
            />
          </div>
        </AnimatedReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {CALLOUTS.map((c, i) => (
            <AnimatedReveal key={c.label} delay={i * 0.1}>
              <div className="bg-white/90 rounded-xl p-4 space-y-1 ring-1 ring-neutral-100">
                <p className="text-sm font-semibold text-primary-700">{c.label}</p>
                <p className="text-sm text-neutral-500 leading-relaxed">{c.description}</p>
              </div>
            </AnimatedReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
