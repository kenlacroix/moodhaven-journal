import AnimatedStatsStrip, { type StatItem } from "./AnimatedStatsStrip";

async function fetchReleaseInfo(): Promise<{ version: string; date: string }> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/kenlacroix/moodhaven-journal/releases/latest",
      { next: { revalidate: 3600 } } as RequestInit
    );
    if (!res.ok) throw new Error("fetch failed");
    const data = (await res.json()) as { tag_name?: string; published_at?: string };
    const date = data.published_at
      ? new Date(data.published_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "June 2026";
    return { version: data.tag_name ?? "v1.8.0", date };
  } catch {
    return { version: "v1.8.0", date: "June 2026" };
  }
}

export default async function StatsStrip() {
  const { version, date } = await fetchReleaseInfo();

  const stats: StatItem[] = [
    {
      label: "tests passing",
      value: "1,461",
      href: "https://github.com/kenlacroix/moodhaven-journal",
    },
    {
      label: "Tauri commands",
      value: "~170",
      href: "https://github.com/kenlacroix/moodhaven-journal/blob/main/docs/tauri-commands.md",
    },
    { label: "latest release", value: version, href: "/changelog" },
    { label: "shipped", value: date },
    { label: "external analytics", value: "0" },
  ];

  return <AnimatedStatsStrip stats={stats} />;
}
