export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  sizeLabel: string;
  /** true when a checksums.txt was found in the release and the asset is listed. */
  checksumVerified?: boolean;
}

export interface LatestRelease {
  version: string;
  releaseUrl: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

const GITHUB_REPO = "kenlacroix/moodhaven-journal";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
// Fallback: pre-published JSON artifact (CI-generated, present on older releases)
const RELEASE_JSON_FALLBACK = `https://github.com/${GITHUB_REPO}/releases/latest/download/latest-release.json`;

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function parseGitHubApiResponse(data: unknown): LatestRelease | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  const version = typeof d.tag_name === "string" ? d.tag_name : null;
  const releaseUrl = typeof d.html_url === "string" ? d.html_url : null;
  const publishedAt = typeof d.published_at === "string" ? d.published_at : null;

  if (!version || !releaseUrl || !publishedAt) return null;
  if (!releaseUrl.startsWith("https://github.com/")) return null;

  const assets: ReleaseAsset[] = [];
  if (Array.isArray(d.assets)) {
    for (const asset of d.assets) {
      if (!asset || typeof asset !== "object") continue;
      const a = asset as Record<string, unknown>;
      const name = typeof a.name === "string" ? a.name : "";
      const downloadUrl =
        typeof a.browser_download_url === "string" ? a.browser_download_url : "";
      const size = typeof a.size === "number" ? a.size : 0;

      if (!name || !downloadUrl.startsWith("https://github.com/")) continue;
      assets.push({ name, downloadUrl, sizeLabel: formatBytes(size) });
    }
  }

  if (assets.length === 0) return null;
  return { version, releaseUrl, publishedAt, assets };
}

function isValidRelease(data: unknown): data is LatestRelease {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== "string" || !d.version) return false;
  if (
    typeof d.releaseUrl !== "string" ||
    !d.releaseUrl.startsWith("https://github.com/")
  )
    return false;
  if (typeof d.publishedAt !== "string") return false;
  if (!Array.isArray(d.assets)) return false;
  for (const asset of d.assets) {
    if (!asset || typeof asset !== "object") return false;
    const a = asset as Record<string, unknown>;
    if (typeof a.name !== "string") return false;
    if (typeof a.downloadUrl !== "string") return false;
    if (!a.downloadUrl.startsWith("https://github.com/")) return false;
    if (typeof a.sizeLabel !== "string") return false;
  }
  return true;
}

async function fetchFromGitHubAPI(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return parseGitHubApiResponse(data);
  } catch {
    return null;
  }
}

async function fetchFromReleaseJSON(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(RELEASE_JSON_FALLBACK, {
      redirect: "follow",
      headers: { "Cache-Control": "no-store" },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isValidRelease(data)) return null;
    if (data.assets.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch the latest release. GitHub API is the source of truth — no CI step
 * required. Falls back to the pre-published release JSON if the API is
 * unavailable or rate-limited.
 */
export async function getLatestRelease(): Promise<LatestRelease | null> {
  const fromAPI = await fetchFromGitHubAPI();
  if (fromAPI) return fromAPI;
  return fetchFromReleaseJSON();
}

/** Return only the version string, for lightweight use in the hero chip. */
export async function getLatestVersion(): Promise<string | null> {
  const release = await getLatestRelease();
  return release?.version ?? null;
}
