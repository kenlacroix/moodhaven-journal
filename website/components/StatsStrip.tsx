import { ExternalLink } from 'lucide-react';

interface StatItem {
  label: string;
  value: string;
  href?: string;
}

async function fetchReleaseInfo(): Promise<{ version: string; date: string }> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/kenlacroix/moodhaven-journal/releases/latest',
      { next: { revalidate: 3600 } } as RequestInit
    );
    if (!res.ok) throw new Error('fetch failed');
    const data = (await res.json()) as { tag_name?: string; published_at?: string };
    const date = data.published_at
      ? new Date(data.published_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })
      : 'June 2026';
    return { version: data.tag_name ?? 'v1.8.0', date };
  } catch {
    return { version: 'v1.8.0', date: 'June 2026' };
  }
}

export default async function StatsStrip() {
  const { version, date } = await fetchReleaseInfo();

  const stats: StatItem[] = [
    { label: 'tests passing', value: '1,461', href: 'https://github.com/kenlacroix/moodhaven-journal' },
    { label: 'Tauri commands', value: '~170', href: 'https://github.com/kenlacroix/moodhaven-journal/blob/main/docs/tauri-commands.md' },
    { label: 'latest release', value: version, href: '/changelog' },
    { label: 'shipped', value: date },
    { label: 'external analytics', value: '0' },
  ];

  return (
    <div className="bg-primary-950 text-primary-200 py-3 overflow-x-auto">
      <ul className="flex items-center justify-center gap-5 md:gap-10 min-w-max mx-auto px-4 text-xs font-mono">
        {stats.map((stat, i) => (
          <li key={i} className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-white">{stat.value}</span>
            <span className="text-primary-400">{stat.label}</span>
            {stat.href && (
              <a
                href={stat.href}
                className="text-primary-600 hover:text-primary-300 transition-colors"
                aria-label={`View ${stat.label}`}
              >
                <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
              </a>
            )}
            {i < stats.length - 1 && (
              <span className="ml-4 text-primary-700" aria-hidden="true">·</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
