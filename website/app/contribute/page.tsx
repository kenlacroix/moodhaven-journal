import type { Metadata } from "next";
import { Code2, FileText, Megaphone, Bug, BookOpen, Star } from "lucide-react";
import AnimatedReveal from "@/components/AnimatedReveal";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contribute — MoodHaven Journal",
  description: "Help build MoodHaven Journal — pull requests, bug reports, documentation, testing, and spreading the word all make a difference.",
};

const WAYS = [
  {
    icon: Code2,
    title: "Developers",
    body: "Pull requests, bug reports, and feature ideas are all welcome. The codebase is Tauri v2 (Rust) + React + TypeScript + SQLite. Check open issues or start with a good-first-issue.",
    cta: { label: "Browse open issues", href: "https://github.com/kenlacroix/moodhaven-journal/issues" },
  },
  {
    icon: Bug,
    title: "Testers",
    body: "Found a bug? Reproduce it, document the steps, and open an issue. Even a one-sentence \"this broke\" with your OS version helps enormously.",
    cta: { label: "Report a bug", href: "https://github.com/kenlacroix/moodhaven-journal/issues/new" },
  },
  {
    icon: FileText,
    title: "Writers",
    body: "Help improve our documentation, the changelog, or the blog. Good writing is as valuable as good code — and the bar here is: would a new user understand this?",
    cta: { label: "View docs on GitHub", href: "https://github.com/kenlacroix/moodhaven-journal/tree/main/docs" },
  },
  {
    icon: Megaphone,
    title: "Advocates",
    body: "If you believe in what we're building, share it. A GitHub star, a post, or telling one person who'd appreciate a private journaling tool matters more than it sounds.",
    cta: { label: "Star on GitHub", href: "https://github.com/kenlacroix/moodhaven-journal" },
  },
];

const LINKS = [
  { icon: BookOpen, label: "Read CONTRIBUTING.md", sublabel: "Full guide: setup, conventions, PR checklist", href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/CONTRIBUTING.md" },
  { icon: Bug, label: "Open issues", sublabel: "Browse bugs, feature requests, and good-first-issues", href: "https://github.com/kenlacroix/moodhaven-journal/issues" },
  { icon: Code2, label: "Architecture overview", sublabel: "How the app is built — Rust, React, SQLite, encryption", href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/docs/architecture.md" },
  { icon: Star, label: "Star the repo", sublabel: "Helps others discover MoodHaven", href: "https://github.com/kenlacroix/moodhaven-journal" },
];

export default function ContributePage() {
  return (
    <main id="main-content" className="bg-[var(--background)] px-4 pt-12 pb-20">
      <div className="max-w-3xl mx-auto">

        <AnimatedReveal>
          <p className="text-center text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            Open source
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 text-center mb-2">
            Contribute to MoodHaven
          </h1>
          <p className="text-center text-neutral-500 text-base mb-12 max-w-lg mx-auto">
            MoodHaven is community-built. Whether you write Rust, write prose, or just write in your journal — there&apos;s a way to help.
          </p>
        </AnimatedReveal>

        {/* Ways to contribute */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
          {WAYS.map((way, i) => {
            const Icon = way.icon;
            return (
              <AnimatedReveal key={way.title} delay={i * 0.08}>
                <div className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-100 h-full flex flex-col space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary-600" aria-hidden="true" />
                  </div>
                  <h2 className="text-base font-semibold text-neutral-900">{way.title}</h2>
                  <p className="text-sm text-neutral-600 leading-relaxed flex-1">{way.body}</p>
                  <a
                    href={way.cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline mt-auto"
                  >
                    {way.cta.label} <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </AnimatedReveal>
            );
          })}
        </div>

        {/* Quick links */}
        <AnimatedReveal delay={0.15}>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-4">Quick links</p>
          <div className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200 overflow-hidden">
            {LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 bg-white/90 px-5 py-4 hover:bg-primary-50 transition-colors duration-150 group focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary-600" aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900 group-hover:text-primary-700 transition-colors">{link.label}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{link.sublabel}</p>
                  </div>
                  <span className="text-neutral-400 group-hover:text-primary-700 transition-colors" aria-hidden="true">↗</span>
                </a>
              );
            })}
          </div>
        </AnimatedReveal>

        {/* CTA */}
        <AnimatedReveal delay={0.2}>
          <div className="mt-10 text-center">
            <a
              href="https://github.com/kenlacroix/moodhaven-journal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-primary-700 text-white px-8 py-3 text-sm font-semibold hover:bg-primary-800 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60"
            >
              View on GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>
        </AnimatedReveal>

      </div>
    </main>
  );
}
