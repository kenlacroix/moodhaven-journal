"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import AnimatedReveal from "@/components/AnimatedReveal";

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

interface Milestone {
  date: string;
  title: string;
  description: string;
  projected?: boolean;
}

const MILESTONES: Milestone[] = [
  { date: "Mar 2025", title: "Idea Born", description: "Ken conceives MoodHaven after searching for a safe journaling space." },
  { date: "Aug 2025", title: "Alpha Launch", description: "Released first alpha to a small community for feedback." },
  { date: "Sep 2025", title: "Community Growth", description: "Grew to 100+ alpha users sharing insights and suggestions." },
  { date: "Oct 2025", title: "Feature Refinement", description: "Implemented privacy-first encryption, custom prompts, and mood tracking." },
  { date: "Apr 2026", title: "v0.8.0 — Web App", description: "Launched web app at journal.moodhaven.app, Wear OS Phase 4, Time Capsule, and LAN peer sync." },
  { date: "Apr 2026", title: "v0.9.0 — Security Hardening", description: "Lock guards on sensitive commands, settings refactor, and full security audit pass." },
  { date: "Apr 2026", title: "v0.9.1 — Unlock & Reset", description: "Factory reset, improved unlock flow, and pre-unlock session error handling." },
  { date: "Apr 2026", title: "v0.9.3 — Website & Polish", description: "Redesigned landing site, improved download page, and across-the-board UI refinements." },
  { date: "Late 2026", title: "v1.0 — Public Release", description: "Stable release with full documentation, GitHub Wiki, and broad platform support.", projected: true },
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

// ─── Timeline ─────────────────────────────────────────────────────────────────

function Timeline() {
  const prefersReduced = useReducedMotion();
  const completed = MILESTONES.filter((m) => !m.projected);
  const projected = MILESTONES.filter((m) => m.projected);
  const percentComplete = Math.round((completed.length / MILESTONES.length) * 100);

  const entryRefs = useRef<Array<HTMLLIElement | null>>(Array(MILESTONES.length).fill(null));
  const [visible, setVisible] = useState<boolean[]>(Array(MILESTONES.length).fill(false));

  useEffect(() => {
    if (prefersReduced) {
      setVisible(Array(MILESTONES.length).fill(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number(e.target.getAttribute("data-idx"));
            setVisible((v) => {
              const copy = [...v];
              copy[idx] = true;
              return copy;
            });
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.3 }
    );
    entryRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, [prefersReduced]);

  return (
    <div className="bg-primary-50 rounded-2xl p-6 lg:p-10">
      {/* Progress bar */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 bg-primary-100 rounded-full h-2">
          <div
            className="bg-primary-500 h-2 rounded-full transition-[width] duration-1000 ease-out"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
        <span className="text-xs text-neutral-500 whitespace-nowrap">{percentComplete}% complete</span>
      </div>

      <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-4">
        Milestones
      </h3>
      <ol role="list" className="space-y-5 mb-8">
        {completed.map((m, idx) => (
          <motion.li
            key={idx}
            data-idx={idx}
            ref={(el) => { entryRefs.current[idx] = el; }}
            initial={prefersReduced ? false : { opacity: 0, x: 30 }}
            animate={visible[idx] ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="group flex items-start gap-4"
          >
            <div className="flex flex-col items-center mt-1">
              <span className="w-3 h-3 bg-primary-500 rounded-full ring-2 ring-white transition-colors group-hover:bg-accent-cta flex-shrink-0" />
              {idx < completed.length - 1 && <span className="w-0.5 h-full min-h-[20px] bg-primary-200 mt-1" />}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-primary-700 group-hover:text-accent-cta transition-colors">
                {m.title}
              </h4>
              <p className="text-xs text-neutral-400">{m.date}</p>
              <p className="mt-1 text-sm text-neutral-600 leading-relaxed">{m.description}</p>
            </div>
          </motion.li>
        ))}
      </ol>

      <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-4">
        Roadmap
      </h3>
      <ol role="list" className="space-y-5 opacity-60">
        {projected.map((m, idx) => (
          <li key={idx} className="group flex items-start gap-4">
            <div className="flex flex-col items-center mt-1">
              <span className="w-3 h-3 bg-transparent ring-2 ring-primary-500 rounded-full flex-shrink-0" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-primary-700 flex items-center gap-2">
                {m.title}
                <span className="text-[10px] bg-neutral-200 text-neutral-500 px-1.5 py-0.5 rounded">
                  Projected
                </span>
              </h4>
              <p className="text-xs text-neutral-400">{m.date}</p>
              <p className="mt-1 text-sm text-neutral-600 leading-relaxed">{m.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
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
            <Timeline />
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

        {/* Footer attribution */}
        <p className="text-xs text-neutral-400 text-center pb-2">
          MoodHaven is built and maintained by{" "}
          <a
            href="https://www.kennethlacroix.me"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-neutral-600"
          >
            Ken LaCroix
          </a>
          . MIT License.
        </p>

      </div>
    </main>
  );
}
