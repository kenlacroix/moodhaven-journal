import { describe, it, expect } from "vitest";
import {
  detectOS,
  detectArch,
  getPrimaryAsset,
  getWearAsset,
  getAndroidPhoneAsset,
} from "./platformDetection";
import type { ReleaseAsset } from "./getLatestRelease";

// ─── detectOS ────────────────────────────────────────────────────────────────

describe("detectOS", () => {
  it("detects Windows", () => {
    expect(detectOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
  });

  it("detects macOS", () => {
    expect(detectOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos");
  });

  it("detects Linux", () => {
    expect(detectOS("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });

  it("detects Android before Linux", () => {
    expect(detectOS("Mozilla/5.0 (Linux; Android 13; Pixel 7)")).toBe("android");
  });

  it("detects iOS (iPhone)", () => {
    expect(detectOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
  });

  it("detects iOS (iPad)", () => {
    expect(detectOS("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("ios");
  });

  it("returns unknown for FreeBSD", () => {
    expect(detectOS("Mozilla/5.0 (X11; FreeBSD amd64)")).toBe("unknown");
  });
});

// ─── detectArch ──────────────────────────────────────────────────────────────

describe("detectArch", () => {
  it("detects x64 (WOW64)", () => {
    expect(detectArch("Mozilla/5.0 (Windows NT 10.0; WOW64)")).toBe("x64");
  });

  it("detects x64 (Win64)", () => {
    expect(detectArch("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("x64");
  });

  it("detects arm64", () => {
    expect(detectArch("Mozilla/5.0 (Macintosh; arm64)")).toBe("arm64");
  });

  it("returns unknown for Mac UA (both Intel and Apple Silicon report identical UA strings)", () => {
    // Browsers on macOS report "Intel Mac OS X" regardless of actual chip — cannot distinguish via UA
    expect(detectArch("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")).toBe("unknown");
  });
});

// ─── getPrimaryAsset ─────────────────────────────────────────────────────────

function asset(name: string, size = "50 MB"): ReleaseAsset {
  return {
    name,
    downloadUrl: `https://github.com/kenlacroix/moodhaven-journal/releases/download/v1.0.0/${name}`,
    sizeLabel: size,
  };
}

const TEST_ASSETS: ReleaseAsset[] = [
  asset("MoodHaven_1.0.0_amd64.AppImage"),
  asset("MoodHaven_1.0.0_arm64.AppImage"),
  asset("MoodHaven_1.0.0_x64-setup.exe"),
  asset("MoodHaven_1.0.0_arm64-setup.exe"),
  asset("MoodHaven_1.0.0_x64.dmg"),
  asset("MoodHaven_1.0.0_aarch64.dmg"),
  asset("MoodHaven_1.0.0_phone.apk"),
  asset("MoodHaven_1.0.0_wear-debug.apk"),
];

describe("getPrimaryAsset", () => {
  it("returns Linux x64 AppImage", () => {
    const a = getPrimaryAsset(TEST_ASSETS, "linux", "x64");
    expect(a?.name).toBe("MoodHaven_1.0.0_amd64.AppImage");
  });

  it("returns Linux arm64 AppImage", () => {
    const a = getPrimaryAsset(TEST_ASSETS, "linux", "arm64");
    expect(a?.name).toBe("MoodHaven_1.0.0_arm64.AppImage");
  });

  it("returns Windows x64 exe", () => {
    const a = getPrimaryAsset(TEST_ASSETS, "windows", "x64");
    expect(a?.name).toBe("MoodHaven_1.0.0_x64-setup.exe");
  });

  it("returns Windows arm64 exe", () => {
    const a = getPrimaryAsset(TEST_ASSETS, "windows", "arm64");
    expect(a?.name).toBe("MoodHaven_1.0.0_arm64-setup.exe");
  });

  it("returns macOS arm64 dmg (Apple Silicon)", () => {
    const a = getPrimaryAsset(TEST_ASSETS, "macos", "arm64");
    expect(a?.name).toBe("MoodHaven_1.0.0_aarch64.dmg");
  });

  it("returns macOS x64 dmg (Intel)", () => {
    const a = getPrimaryAsset(TEST_ASSETS, "macos", "x64");
    expect(a?.name).toBe("MoodHaven_1.0.0_x64.dmg");
  });

  it("defaults macOS to arm64 when arch unknown", () => {
    const a = getPrimaryAsset(TEST_ASSETS, "macos", "unknown");
    expect(a?.name).toBe("MoodHaven_1.0.0_aarch64.dmg");
  });

  it("defaults Linux to x64 when arch unknown", () => {
    const a = getPrimaryAsset(TEST_ASSETS, "linux", "unknown");
    expect(a?.name).toBe("MoodHaven_1.0.0_amd64.AppImage");
  });

  it("returns undefined for unknown OS", () => {
    expect(getPrimaryAsset(TEST_ASSETS, "unknown", "x64")).toBeUndefined();
  });

  it("returns undefined for empty assets", () => {
    expect(getPrimaryAsset([], "linux", "x64")).toBeUndefined();
  });

  it("returns undefined when no matching asset", () => {
    expect(getPrimaryAsset([asset("SomethingElse.tar.gz")], "linux", "x64")).toBeUndefined();
  });
});

// ─── getWearAsset / getAndroidPhoneAsset ─────────────────────────────────────

describe("getWearAsset", () => {
  it("returns the wear APK", () => {
    expect(getWearAsset(TEST_ASSETS)?.name).toBe("MoodHaven_1.0.0_wear-debug.apk");
  });

  it("returns undefined when no wear APK", () => {
    expect(getWearAsset([asset("MoodHaven_1.0.0_phone.apk")])).toBeUndefined();
  });
});

describe("getAndroidPhoneAsset", () => {
  it("returns the phone APK (not wear)", () => {
    expect(getAndroidPhoneAsset(TEST_ASSETS)?.name).toBe("MoodHaven_1.0.0_phone.apk");
  });

  it("returns undefined when only wear APK present", () => {
    expect(getAndroidPhoneAsset([asset("MoodHaven_1.0.0_wear-debug.apk")])).toBeUndefined();
  });
});
