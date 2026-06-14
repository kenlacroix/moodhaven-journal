import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLatestRelease } from "./getLatestRelease";

const VALID_PAYLOAD = {
  version: "v0.9.0",
  releaseUrl: "https://github.com/kenlacroix/moodhaven-journal/releases/tag/v0.9.0",
  publishedAt: "2026-04-01T00:00:00Z",
  assets: [
    {
      name: "MoodHaven_0.9.0_amd64.AppImage",
      downloadUrl: "https://github.com/kenlacroix/moodhaven-journal/releases/download/v0.9.0/MoodHaven_0.9.0_amd64.AppImage",
      sizeLabel: "92.3 MB",
    },
  ],
};

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("getLatestRelease", () => {
  it("returns typed LatestRelease for valid JSON", async () => {
    mockFetch(VALID_PAYLOAD);
    const result = await getLatestRelease();
    expect(result).not.toBeNull();
    expect(result?.version).toBe("v0.9.0");
    expect(result?.assets).toHaveLength(1);
  });

  it("returns null for null version stub (first-deploy path)", async () => {
    mockFetch({ version: null, releaseUrl: null, publishedAt: null, assets: [] });
    expect(await getLatestRelease()).toBeNull();
  });

  it("returns null on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    expect(await getLatestRelease()).toBeNull();
  });

  it("returns null on non-ok HTTP response", async () => {
    mockFetch(VALID_PAYLOAD, false);
    expect(await getLatestRelease()).toBeNull();
  });

  it("returns null for malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    }));
    expect(await getLatestRelease()).toBeNull();
  });

  it("returns null when downloadUrl is not a github.com URL", async () => {
    mockFetch({
      ...VALID_PAYLOAD,
      assets: [{ ...VALID_PAYLOAD.assets[0], downloadUrl: "https://evil.com/malware.exe" }],
    });
    expect(await getLatestRelease()).toBeNull();
  });

  it("returns null when releaseUrl is not a github.com URL", async () => {
    mockFetch({ ...VALID_PAYLOAD, releaseUrl: "https://evil.com/releases" });
    expect(await getLatestRelease()).toBeNull();
  });

  it("returns null when assets array is empty", async () => {
    mockFetch({ ...VALID_PAYLOAD, assets: [] });
    expect(await getLatestRelease()).toBeNull();
  });

  it("passes through virusTotalUrl from the fallback JSON", async () => {
    const url =
      "https://github.com/kenlacroix/moodhaven-journal/releases/download/v0.9.0/virustotal.txt";
    mockFetch({ ...VALID_PAYLOAD, virusTotalUrl: url });
    const result = await getLatestRelease();
    expect(result?.virusTotalUrl).toBe(url);
  });

  it("rejects a non-github virusTotalUrl in the fallback JSON", async () => {
    mockFetch({ ...VALID_PAYLOAD, virusTotalUrl: "https://evil.com/report.txt" });
    expect(await getLatestRelease()).toBeNull();
  });

  it("leaves virusTotalUrl undefined when the release has no report", async () => {
    mockFetch(VALID_PAYLOAD);
    const result = await getLatestRelease();
    expect(result?.virusTotalUrl).toBeUndefined();
  });

  it("extracts virusTotalUrl from the GitHub API asset list and drops it from assets", async () => {
    const vtUrl =
      "https://github.com/kenlacroix/moodhaven-journal/releases/download/v0.9.0/virustotal.txt";
    mockFetch({
      tag_name: "v0.9.0",
      html_url: "https://github.com/kenlacroix/moodhaven-journal/releases/tag/v0.9.0",
      published_at: "2026-04-01T00:00:00Z",
      assets: [
        {
          name: "MoodHaven_0.9.0_amd64.AppImage",
          browser_download_url:
            "https://github.com/kenlacroix/moodhaven-journal/releases/download/v0.9.0/MoodHaven_0.9.0_amd64.AppImage",
          size: 96_780_000,
        },
        { name: "virustotal.txt", browser_download_url: vtUrl, size: 1024 },
      ],
    });
    const result = await getLatestRelease();
    expect(result?.virusTotalUrl).toBe(vtUrl);
    expect(result?.assets.map((a) => a.name)).not.toContain("virustotal.txt");
  });
});
