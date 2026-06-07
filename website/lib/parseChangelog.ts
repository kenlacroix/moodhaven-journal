import fs from "fs";
import path from "path";

export interface Section {
  heading: string; // "Added", "Fixed", "Changed", "Security", etc.
  items: string[];
}

export interface Release {
  version: string;       // "0.9.3"
  date: string;          // "2026-04-12"
  sections: Section[];
  forContributors?: string[]; // "For contributors" blocks
}

export function parseChangelog(md: string): Release[] {
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

/**
 * Read CHANGELOG.md — tries the repo root first (local dev + full-repo builds),
 * then falls back to website/content/CHANGELOG.md.
 */
export function readChangelog(): string {
  const candidates = [
    path.join(process.cwd(), "..", "CHANGELOG.md"),
    path.join(process.cwd(), "content", "CHANGELOG.md"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf-8");
    }
  }
  return "";
}
