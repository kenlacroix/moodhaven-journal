"use client";

import { useState } from "react";
import Link from "next/link";
import AnimatedReveal from "./AnimatedReveal";

function formatPublishedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

interface CommunityCalloutProps {
  version?: string;
  publishedAt?: string;
}

export default function CommunityCallout({ version, publishedAt }: CommunityCalloutProps) {
  const [badgeFailed, setBadgeFailed] = useState(false);

  const displayVersion = version ?? "v1.8.0";
  const displayDate = publishedAt ? formatPublishedAt(publishedAt) : "";

  const BUILD_STATS = [
    { label: "Current version", value: displayVersion },
    { label: "Automated tests", value: "1,461" },
    { label: "License", value: "MIT" },
    { label: "First commit", value: "Mar 2025" },
  ];

  return (
    <section className="bg-[var(--background)] px-4 py-14">
      <AnimatedReveal>
        <div className="max-w-3xl mx-auto bg-white/90 rounded-2xl px-8 py-10 text-center shadow-sm ring-1 ring-neutral-200">
          <h2 className="text-xl font-bold text-neutral-900 mb-3">
            MoodHaven is open source
          </h2>

          <div className="flex justify-center mb-6" aria-label="GitHub repository stars">
            {badgeFailed ? (
              <span className="text-sm text-neutral-500">Open source on GitHub</span>
            ) : (
              <img
                src="https://img.shields.io/github/stars/kenlacroix/moodhaven-journal?style=social"
                alt="GitHub stars count"
                onError={() => setBadgeFailed(true)}
                className="h-5"
              />
            )}
          </div>

          {/* Build-in-public stats strip */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {BUILD_STATS.map((stat) => (
              <div
                key={stat.label}
                className="bg-neutral-50 rounded-xl px-3 py-4 flex flex-col items-center gap-1"
              >
                <dd className="text-lg font-bold text-primary-700">{stat.value}</dd>
                <dt className="text-xs text-neutral-500 text-center leading-snug">{stat.label}</dt>
              </div>
            ))}
          </dl>

          {displayDate && (
            <p className="text-xs text-neutral-400 -mt-4 mb-6">
              {displayVersion} released {displayDate}
            </p>
          )}

          <p className="text-sm text-neutral-600 mb-8 max-w-sm mx-auto leading-relaxed">
            Built in public. Every line of code visible to you. MIT licensed.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/kenlacroix/moodhaven-journal"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-neutral-700 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/60"
            >
              View on GitHub <span aria-hidden="true">↗</span>
            </a>
            <Link
              href="/contribute"
              className="rounded-full bg-white text-neutral-900 px-5 py-2.5 text-sm font-medium border border-neutral-300 hover:bg-neutral-50 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
            >
              How to Contribute
            </Link>
            <Link
              href="/blog"
              className="rounded-full bg-white text-neutral-900 px-5 py-2.5 text-sm font-medium border border-neutral-300 hover:bg-neutral-50 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
            >
              Read the Blog
            </Link>
          </div>

          <p className="mt-6 text-xs text-neutral-400">
            View all articles on{" "}
            <a
              href="https://moodhaven.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-neutral-600"
            >
              Substack <span aria-hidden="true">→</span>
            </a>
          </p>
        </div>
      </AnimatedReveal>
    </section>
  );
}
