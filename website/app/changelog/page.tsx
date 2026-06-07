// app/changelog/page.tsx
// Server component — reads CHANGELOG.md from repo root at build time.

import { ExternalLink } from "lucide-react";
import { parseChangelog, readChangelog } from "@/lib/parseChangelog";

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

import type { Metadata } from "next";
import ChangelogList from "@/components/ChangelogList";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What's new in MoodHaven Journal — release notes for every version including new features, bug fixes, and security improvements.",
  alternates: { canonical: "https://www.moodhaven.app/changelog" },
};

export default function ChangelogPage() {
  const md = readChangelog();
  const releases = md ? parseChangelog(md) : [];

  return (
    <main
      id="main-content"
      className="bg-[var(--background)] text-[var(--foreground)] px-4 pt-10 pb-16"
    >
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight mb-3">
            Changelog
          </h1>
          <p className="text-neutral-500 text-sm">
            All notable changes to MoodHaven Journal. Follows{" "}
            <a
              href="https://keepachangelog.com/en/1.1.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-700 hover:underline"
            >
              Keep a Changelog
            </a>{" "}
            and{" "}
            <a
              href="https://semver.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-700 hover:underline"
            >
              Semantic Versioning
            </a>
            .{" "}
            <a
              href="https://github.com/kenlacroix/moodhaven-journal/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary-700 hover:underline"
            >
              View raw on GitHub
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </p>
        </div>

        {releases.length === 0 ? (
          <div className="bg-primary-50 rounded-2xl px-6 py-10 text-center">
            <p className="text-neutral-600 text-sm mb-3">
              Changelog not available in this build.
            </p>
            <a
              href="https://github.com/kenlacroix/moodhaven-journal/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
            >
              Read it on GitHub
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <>
            {/* Version jump-list */}
            <nav aria-label="Jump to version" className="mb-8 flex flex-wrap gap-1.5">
              {releases.map((release) => (
                <a
                  key={release.version}
                  href={`#v${release.version}`}
                  className="text-xs font-mono px-2.5 py-1 rounded-full bg-white ring-1 ring-neutral-200 text-neutral-600 hover:text-primary-700 hover:ring-primary-300 transition-colors duration-150"
                >
                  v{release.version}
                </a>
              ))}
            </nav>
            <ChangelogList releases={releases} />
          </>
        )}
      </div>
    </main>
  );
}
