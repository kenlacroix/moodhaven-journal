import Image from "next/image";
import AnimatedReveal from "@/components/AnimatedReveal";
import TimelineClient, { type Milestone } from "./TimelineClient";
import { parseChangelog, readChangelog, type Release } from "@/lib/parseChangelog";

// ─── Data ─────────────────────────────────────────────────────────────────────

const PRINCIPLES = [
  {
    title: "Privacy as default",
    body: "We don't need your data to make this work. All analysis runs on your device, with your keys.",
    emoji: "🔒",
  },
  {
    title: "Not yours to monetize",
    body: "Your thoughts are not a product. We don't sell data, run ads, or build profiles.",
    emoji: "🚫",
  },
  {
    title: "Simplicity is a feature",
    body: "A writing tool that gets out of your way. No feeds, no social features, no gamification.",
    emoji: "✦",
  },
  {
    title: "Open source = accountability",
    body: "Every line of code is public. You don't have to trust our privacy claims — you can verify them.",
    emoji: "📖",
  },
];

const NARRATIVE_MILESTONES: Milestone[] = [
  { date: "Mar 2025", title: "Idea Born", description: "Ken conceives MoodHaven after searching for a safe journaling space." },
  { date: "Aug 2025", title: "Alpha Launch", description: "First alpha builds — a quiet build-in-public project rather than a launch." },
  { date: "Oct 2025", title: "Feature Refinement", description: "Implemented privacy-first encryption, custom prompts, and mood tracking." },
];

const TECH_LINKS = [
  {
    label: "GitHub repository",
    sublabel: "Browse the source code",
    href: "https://github.com/kenlacroix/moodhaven-journal",
    external: true,
  },
  {
    label: "Architecture overview",
    sublabel: "How it's built — Tauri v2, Rust, React, SQLite",
    href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/docs/architecture.md",
    external: true,
  },
  {
    label: "Security model",
    sublabel: "AES-256-GCM, PBKDF2, zero-knowledge design",
    href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/SECURITY.md",
    external: true,
  },
  {
    label: "Changelog",
    sublabel: "What's changed in each release",
    href: "/changelog",
    external: false,
  },
  {
    label: "Contribute",
    sublabel: "How to report bugs and send PRs",
    href: "/contribute",
    external: false,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECTION_PRIORITY = ["Added", "Changed", "Fixed", "Security"];

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}

function firstBullet(release: Release): string {
  for (const heading of SECTION_PRIORITY) {
    const section = release.sections.find((s) => s.heading === heading);
    if (section && section.items.length > 0) return stripMarkdown(section.items[0]);
  }
  for (const section of release.sections) {
    if (section.items.length > 0) return stripMarkdown(section.items[0]);
  }
  return "New features and improvements.";
}

function formatReleaseDate(iso: string): string {
  if (!iso) return "";
  try {
    const [year, month] = iso.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function releaseToMilestone(release: Release): Milestone {
  return {
    date: formatReleaseDate(release.date),
    title: `v${release.version}`,
    description: firstBullet(release),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const md = readChangelog();
  const releases = md ? parseChangelog(md) : [];

  // Oldest-first release milestones (parseChangelog returns newest-first)
  const releaseMilestones: Milestone[] = [...releases].reverse().map(releaseToMilestone);

  const milestones: Milestone[] = [...NARRATIVE_MILESTONES, ...releaseMilestones];

  return (
    <main id="main-content" className="bg-[var(--background)] text-[var(--foreground)] px-4 pt-10 pb-16">
      <div className="max-w-3xl mx-auto space-y-16">

        {/* Mission */}
        <AnimatedReveal>
          <section>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight mb-6">
              About MoodHaven Journal
            </h1>
            <div className="prose prose-neutral max-w-none text-neutral-600 space-y-4">
              <p>
                MoodHaven started because its creator couldn&apos;t find a journaling space that felt safe, calm, and respectful of personal growth. Most platforms felt too clinical, too public, or too commercial.
              </p>
              <p>
                The answer was a tool rooted in one belief: <strong className="text-neutral-800">your thoughts should stay yours.</strong> No ads. No tracking. No cloud required. Just a space to write, reflect, and grow — that you can verify is doing exactly what it claims.
              </p>
            </div>
          </section>
        </AnimatedReveal>

        {/* Principles */}
        <AnimatedReveal>
          <section>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-6">
              What we believe
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PRINCIPLES.map((p, i) => (
                <AnimatedReveal key={p.title} delay={i * 0.1}>
                  <div className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-200 space-y-2">
                    <div className="text-2xl" aria-hidden="true">{p.emoji}</div>
                    <h3 className="text-sm font-semibold text-neutral-900">{p.title}</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed">{p.body}</p>
                  </div>
                </AnimatedReveal>
              ))}
            </div>
          </section>
        </AnimatedReveal>

        {/* Timeline */}
        <AnimatedReveal>
          <section>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-6">
              Project journey
            </h2>
            <TimelineClient milestones={milestones} />
          </section>
        </AnimatedReveal>

        {/* Technical section */}
        <AnimatedReveal>
          <section>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-2">
              For developers and security researchers
            </h2>
            <p className="text-sm text-neutral-500 mb-6">
              Stack: Tauri v2 · Rust · React · TypeScript · SQLite · AES-256-GCM · PBKDF2
            </p>
            <div className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200 overflow-hidden">
              {TECH_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center justify-between bg-white/90 px-5 py-4 hover:bg-primary-50 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none group"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900 group-hover:text-primary-700 transition-colors">
                      {link.label}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">{link.sublabel}</p>
                  </div>
                  <span className="text-neutral-400 group-hover:text-primary-700 transition-colors text-sm" aria-hidden="true">
                    {link.external ? "↗" : "→"}
                  </span>
                </a>
              ))}
            </div>
          </section>
        </AnimatedReveal>

        {/* Founder card */}
        <AnimatedReveal>
          <section>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-6">
              Built by
            </h2>
            <div className="bg-white/90 rounded-xl ring-1 ring-neutral-200 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <Image
                src="/founder-headshot.png"
                alt="Ken LaCroix, creator of MoodHaven Journal"
                width={80}
                height={80}
                className="rounded-full object-cover ring-2 ring-primary-100 flex-shrink-0"
              />
              <div className="text-center sm:text-left">
                <p className="font-semibold text-neutral-900 mb-0.5">Ken LaCroix</p>
                <p className="text-xs text-neutral-400 mb-3">Creator & Maintainer</p>
                <p className="text-sm text-neutral-600 leading-relaxed mb-4">
                  I built MoodHaven because I couldn&apos;t find a journaling tool that I actually trusted with my thoughts. Every app either harvested data, required a cloud account, or charged for features that should be basic. MoodHaven is my answer — private, open source, and built to last.
                </p>
                <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                  <a
                    href="https://www.kennethlacroix.me"
                    target="_blank"
                    rel="me author noopener noreferrer"
                    className="text-xs font-medium text-primary-700 hover:underline"
                  >
                    Website ↗
                  </a>
                  <a
                    href="https://github.com/kenlacroix"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary-700 hover:underline"
                  >
                    GitHub ↗
                  </a>
                </div>
              </div>
            </div>
          </section>
        </AnimatedReveal>

        {/* Footer attribution */}
        <p className="text-xs text-neutral-400 text-center pb-2">
          MoodHaven Journal is MIT licensed.
        </p>

      </div>
    </main>
  );
}
