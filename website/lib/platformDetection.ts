import type { ReleaseAsset } from "./getLatestRelease";

export type DetectedOS =
  | "windows"
  | "macos"
  | "linux"
  | "android"
  | "ios"
  | "unknown";

export type DetectedArch = "x64" | "arm64" | "unknown";

export function detectOS(ua?: string): DetectedOS {
  const userAgent = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/android/i.test(userAgent)) return "android";
  if (/ipad|iphone/i.test(userAgent)) return "ios";
  if (/windows/i.test(userAgent)) return "windows";
  if (/mac/i.test(userAgent)) return "macos";
  if (/linux/i.test(userAgent)) return "linux";
  return "unknown";
}

export function detectArch(ua?: string): DetectedArch {
  const userAgent = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/arm64|aarch64/i.test(userAgent)) return "arm64";
  if (/x86_64|x64|wow64|win64/i.test(userAgent)) return "x64";
  return "unknown";
}

const ASSET_PATTERNS: Record<DetectedOS, Partial<Record<DetectedArch | "default", (name: string) => boolean>>> = {
  linux: {
    x64: (n) => n.endsWith("_amd64.AppImage"),
    arm64: (n) => n.endsWith("_arm64.AppImage"),
    unknown: (n) => n.endsWith("_amd64.AppImage"),
    default: (n) => n.endsWith("_amd64.AppImage"),
  },
  windows: {
    x64: (n) => n.endsWith("_x64-setup.exe"),
    arm64: (n) => n.endsWith("_arm64-setup.exe"),
    unknown: (n) => n.endsWith("_x64-setup.exe"),
    default: (n) => n.endsWith("_x64-setup.exe"),
  },
  macos: {
    // Default to arm64 (Apple Silicon majority since 2021)
    x64: (n) => n.endsWith("_x64.dmg"),
    arm64: (n) => n.endsWith("_aarch64.dmg"),
    unknown: (n) => n.endsWith("_aarch64.dmg"),
    default: (n) => n.endsWith("_aarch64.dmg"),
  },
  android: {
    default: (n) => n.endsWith(".apk") && !/wear/i.test(n),
  },
  ios: {},
  unknown: {},
};

export function getPrimaryAsset(
  assets: ReleaseAsset[],
  os: DetectedOS,
  arch: DetectedArch
): ReleaseAsset | undefined {
  const patterns = ASSET_PATTERNS[os];
  if (!patterns) return undefined;
  const matcher = patterns[arch] ?? patterns["default"];
  if (!matcher) return undefined;
  return assets.find((a) => matcher(a.name));
}

export function getWearAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  return assets.find((a) => /wear/i.test(a.name) && a.name.endsWith(".apk"));
}

export function getAndroidPhoneAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  return assets.find((a) => a.name.endsWith(".apk") && !/wear/i.test(a.name));
}
