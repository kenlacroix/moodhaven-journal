// app/changelog/page.tsx
// Server component — reads CHANGELOG.md from repo root at build time.

import fs from "fs";
import path from "path";
import { ExternalLink } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Parser                                                               */
/* ------------------------------------------------------------------ */

interface Section {
  heading: string; // "Added", "Fixed", "Changed", "Security", etc.
  items: string[];
}

interface Release {
  version: string;       // "0.9.3"
  date: string;          // "2026-04-12"
  sections: Section[];
  forContributors?: string[]; // "For contributors" blocks
}

function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  const versionBlocks = md.split(/^## /m).slice(1); // drop preamble

  for (const block of versionBlocks) {
    const lines = block.split("\n");
    const header = lines[0]; // e.g. "[0.9.3] — 2026-04-12"

    const versionMatch = header.match(/\[([^\]]+)\]/);
    const dateMatch = header.match(/(\d{4}-\d{2}-\d{2})/);

    if (!versionMatch) continue;

    const release: Release = {
      version: versionMatch[1],
      date: dateMatch?.[1] ?? "",
      sections: [],
    };

    let currentSection: Section | null = null;

    for (const line of lines.slice(1)) {
      const sectionMatch = line.match(/^### (.+)/);
      if (sectionMatch) {
        currentSection = { heading: sectionMatch[1], items: [] };
        if (sectionMatch[1] === "For contributors") {
          release.forContributors = release.forContributors ?? [];
        } else {
          release.sections.push(currentSection);
        }
        continue;
      }

      if (line.startsWith("- ") && currentSection) {
        const item = line.slice(2).trim();
        if (
          currentSection.heading === "For contributors" &&
          release.forContributors
        ) {
          release.forContributors.push(item);
        } else {
          currentSection.items.push(item);
        }
      }
    }

    releases.push(release);
  }

  return releases;
}

/* Minimal bold/code renderer — handles **bold** and `code` only */
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-neutral-800">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="font-mono text-xs bg-neutral-100 text-neutral-700 px-1 py-0.5 rounded">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

/* ------------------------------------------------------------------ */
/* Section heading colours                                              */
/* ------------------------------------------------------------------ */

const SECTION_COLORS: Record<string, string> = {
  Added: "text-emerald-700 bg-emerald-50",
  Fixed: "text-amber-700 bg-amber-50",
  Changed: "text-blue-700 bg-blue-50",
  Security: "text-violet-700 bg-violet-50",
  Removed: "text-red-700 bg-red-50",
  Deprecated: "text-orange-700 bg-orange-50",
};

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What's new in MoodHaven Journal — release notes for every version including new features, bug fixes, and security improvements.",
  alternates: { canonical: "https://www.moodhaven.app/changelog" },
};

export default function ChangelogPage() {
  // Try repo root first (local dev + Cloudflare Pages full-repo builds),
  // then fall back to a copy placed at website/content/CHANGELOG.md.
  let md = "";
  const candidates = [
    path.join(process.cwd(), "..", "CHANGELOG.md"),
    path.join(process.cwd(), "content", "CHANGELOG.md"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      md = fs.readFileSync(p, "utf-8");
      break;
    }
  }

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
          <div className="space-y-10">
            {releases.map((release) => (
              <article
                key={release.version}
                id={`v${release.version}`}
                className="bg-white/90 rounded-xl ring-1 ring-neutral-100 overflow-hidden scroll-mt-20"
              >
                {/* Release header */}
                <div className="flex items-baseline justify-between gap-4 px-6 py-4 border-b border-neutral-100">
                  <h2 className="text-lg font-bold text-neutral-900">
                    v{release.version}
                  </h2>
                  {release.date && (
                    <time
                      dateTime={release.date}
                      className="text-xs text-neutral-400 shrink-0"
                    >
                      {new Date(release.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </time>
                  )}
                </div>

                {/* Sections */}
                <div className="px-6 py-5 space-y-6">
                  {release.sections
                    .filter((s) => s.items.length > 0)
                    .map((section) => {
                      const colorClass =
                        SECTION_COLORS[section.heading] ??
                        "text-neutral-700 bg-neutral-100";
                      return (
                        <div key={section.heading}>
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mb-3 ${colorClass}`}
                          >
                            {section.heading}
                          </span>
                          <ul className="space-y-2">
                            {section.items.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2.5 text-sm text-neutral-700 leading-relaxed"
                              >
                                <span
                                  className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-300"
                                  aria-hidden="true"
                                />
                                <span>{renderInline(item)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                </div>
              </article>
            ))}
          </div>
          </>
        )}
      </div>
    </main>
  );
}
