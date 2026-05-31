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

const RELEASE_JSON_URL =
  "https://github.com/kenlacroix/moodhaven-journal/releases/latest/download/latest-release.json";

function isValidRelease(data: unknown): data is LatestRelease {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== "string" || !d.version) return false;
  if (typeof d.releaseUrl !== "string" || !d.releaseUrl.startsWith("https://github.com/")) return false;
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

export async function getLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(RELEASE_JSON_URL, {
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
