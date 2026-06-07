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
  {
    label: "Activity tagging",
    description: "Tag what you were doing — Exercise, Social, Reading — then see mood patterns in the Insights view.",
  },
  {
    label: "Mood calendar",
    description: "Monthly heatmap colored by daily mood. Spot patterns at a glance across weeks and months.",
  },
];

export default function AppPreview() {
  return (
    <section className="bg-[var(--background)] px-4 py-20">
      <div className="max-w-5xl mx-auto">
        <AnimatedReveal>
          <p className="text-center text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            See it in action
          </p>
          <h2 className="text-center text-2xl md:text-3xl font-bold text-neutral-900 mb-4">
            A writing space built for reflection
          </h2>
          <p className="text-center text-neutral-500 text-base mb-12 max-w-md mx-auto">
            Clean, focused, and private by default. Your words stay on your device.
          </p>
        </AnimatedReveal>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <AnimatedReveal delay={0.1} className="lg:col-span-3">
            <div className="rounded-xl overflow-hidden shadow-xl shadow-neutral-200/60 ring-1 ring-neutral-200">
              <Image
                src="/images/writing-view.png"
                alt="MoodHaven Journal writing view — mood selector at top, rich text editor, book switcher in sidebar"
                width={960}
                height={640}
                className="w-full h-auto"
              />
            </div>
            <p className="text-center text-xs text-neutral-400 mt-2">Write view</p>
          </AnimatedReveal>
          <AnimatedReveal delay={0.2} className="lg:col-span-2">
            <div className="rounded-xl overflow-hidden shadow-xl shadow-neutral-200/60 ring-1 ring-neutral-200">
              <Image
                src="/images/app-calendar-view.png"
                alt="MoodHaven Journal calendar view — monthly mood heatmap with today highlighted"
                width={1280}
                height={800}
                className="w-full h-auto"
              />
            </div>
            <p className="text-center text-xs text-neutral-400 mt-2">Calendar view</p>
          </AnimatedReveal>
        </div>

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
