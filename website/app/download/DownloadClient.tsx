"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AnimatedReveal from "@/components/AnimatedReveal";
import type { LatestRelease, ReleaseAsset } from "@/lib/getLatestRelease";
import {
  detectOS,
  detectArch,
  getPrimaryAsset,
  getWearAsset,
  getAndroidPhoneAsset,
  type DetectedOS,
  type DetectedArch,
} from "@/lib/platformDetection";

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function LinuxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.523 15.341a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-9.047 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM3.694 9h16.612A2.694 2.694 0 0 1 23 11.694v5.612A2.694 2.694 0 0 1 20.306 20H3.694A2.694 2.694 0 0 1 1 17.306v-5.612A2.694 2.694 0 0 1 3.694 9zm11.917-3.667-1.157-2.004a.25.25 0 0 0-.433.25l1.171 2.028A7.946 7.946 0 0 0 12 5a7.946 7.946 0 0 0-3.192.607L9.979 3.579a.25.25 0 0 0-.433-.25L8.389 5.333A8.03 8.03 0 0 0 4 12.5h16A8.03 8.03 0 0 0 15.611 5.333z" />
    </svg>
  );
}

function WatchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="7" y="4" width="10" height="16" rx="3" />
      <path d="M9 1h6M9 23h6" strokeLinecap="round" />
      <path d="M12 9v3l2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Platform {
  id: string;
  label: string;
  sublabel: string;
  os: DetectedOS;
  arch?: DetectedArch;
  icon: React.ReactNode;
  asset: ReleaseAsset | undefined;
  fallbackUrl?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OS_LABELS: Record<DetectedOS, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  unknown: "your platform",
};

function staleDays(publishedAt: string): number | null {
  const then = new Date(publishedAt).getTime();
  if (isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DownloadClient({ release }: { release: LatestRelease | null }) {
  const [os, setOs] = useState<DetectedOS>("unknown");
  const [arch, setArch] = useState<DetectedArch>("unknown");
  const [showWear, setShowWear] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);

  useEffect(() => {
    setOs(detectOS());
    setArch(detectArch());
  }, []);

  const primaryAsset = release ? getPrimaryAsset(release.assets, os, arch) : undefined;
  const wearAsset = release ? getWearAsset(release.assets) : undefined;
  const androidAsset = release ? getAndroidPhoneAsset(release.assets) : undefined;

  // macOS secondary: if primary is arm64, offer x64 as well
  const macSecondaryAsset =
    os === "macos" && release
      ? release.assets.find((a) => a.name.endsWith("_x64.dmg"))
      : undefined;

  const days = release?.publishedAt ? staleDays(release.publishedAt) : null;

  const iconClass = "w-8 h-8";

  const platforms: Platform[] = [
    {
      id: "windows",
      label: "Windows",
      sublabel: ".exe installer · x64",
      os: "windows",
      arch: "x64",
      icon: <WindowsIcon className={iconClass} />,
      asset: release ? getPrimaryAsset(release.assets, "windows", "x64") : undefined,
    },
    {
      id: "macos-arm",
      label: "macOS",
      sublabel: "Apple Silicon · .dmg",
      os: "macos",
      arch: "arm64",
      icon: <AppleIcon className={iconClass} />,
      asset: release ? getPrimaryAsset(release.assets, "macos", "arm64") : undefined,
    },
    {
      id: "macos-intel",
      label: "macOS",
      sublabel: "Intel · .dmg",
      os: "macos",
      arch: "x64",
      icon: <AppleIcon className={iconClass} />,
      asset: release ? getPrimaryAsset(release.assets, "macos", "x64") : undefined,
    },
    {
      id: "linux",
      label: "Linux",
      sublabel: ".AppImage · x64",
      os: "linux",
      arch: "x64",
      icon: <LinuxIcon className={iconClass} />,
      asset: release ? getPrimaryAsset(release.assets, "linux", "x64") : undefined,
    },
    {
      id: "android",
      label: "Android",
      sublabel: ".apk · sideload",
      os: "android",
      icon: <AndroidIcon className={iconClass} />,
      asset: androidAsset,
    },
  ];

  const detectedPlatformId = (() => {
    if (os === "windows") return "windows";
    if (os === "macos") return arch === "x64" ? "macos-intel" : "macos-arm";
    if (os === "linux") return "linux";
    if (os === "android") return "android";
    return null;
  })();

  return (
    <main id="main-content" className="min-h-screen bg-[var(--background)] py-14 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <AnimatedReveal>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight text-center">
            Download MoodHaven Journal
          </h1>
          <p className="mt-3 text-center text-neutral-500 text-sm">
            Free to download. Open source.{" "}
            {release?.version && (
              <span className="text-neutral-400">
                Latest: {release.version}
                {days !== null && days > 30 && (
                  <span className="ml-1 text-neutral-400">(released {days} days ago)</span>
                )}
              </span>
            )}
          </p>
        </AnimatedReveal>

        {/* Primary CTA */}
        <AnimatedReveal delay={0.1} className="mt-10">
          {os === "unknown" ? (
            /* Skeleton shimmer while useEffect fires */
            <div className="h-14 w-64 mx-auto rounded-full bg-neutral-200 animate-pulse" aria-hidden="true" />
          ) : os === "ios" ? (
            /* iOS: no native app — send to web app */
            <div className="text-center">
              <a
                href="https://journal.moodhaven.app"
                className="inline-block rounded-full bg-accent-cta text-neutral-900 px-6 py-4 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
              >
                Open in Browser <span aria-hidden="true">→</span>
              </a>
              <p className="mt-2 text-xs text-neutral-500">
                MoodHaven Journal runs in Safari — no install needed.
              </p>
            </div>
          ) : primaryAsset ? (
            <div className="text-center">
              <a
                href={primaryAsset.downloadUrl}
                className="inline-block rounded-full bg-accent-cta text-neutral-900 px-6 py-4 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
                aria-label={`Download for ${OS_LABELS[os]}, ${primaryAsset.name}`}
              >
                Download for {OS_LABELS[os]}{" "}
                <span aria-hidden="true">↓</span>
              </a>
              {primaryAsset.sizeLabel && (
                <p className="mt-2 text-xs text-neutral-500">
                  {primaryAsset.name} · {primaryAsset.sizeLabel} · SHA-256 verified
                </p>
              )}
              {os === "macos" && arch !== "x64" && macSecondaryAsset && (
                <p className="mt-1 text-xs text-neutral-500">
                  Older Mac?{" "}
                  <a
                    href={macSecondaryAsset.downloadUrl}
                    className="underline hover:text-neutral-700"
                  >
                    Download for Intel
                  </a>
                </p>
              )}
            </div>
          ) : (
            /* No matching asset — GitHub fallback */
            <div className="text-center">
              <a
                href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full bg-accent-cta text-neutral-900 px-6 py-4 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
              >
                View releases on GitHub <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}

          {/* Escape hatch */}
          {!overrideMode && os !== "unknown" && os !== "ios" && (
            <p className="mt-3 text-center text-xs text-neutral-400">
              Detected: {OS_LABELS[os]}
              {os === "macos" && arch !== "unknown" && ` (${arch === "arm64" ? "Apple Silicon" : "Intel"})`}
              {" · "}
              <button
                onClick={() => setOverrideMode(true)}
                className="underline hover:text-neutral-600 focus-visible:ring-1 focus-visible:ring-primary-700"
              >
                Change
              </button>
            </p>
          )}
          {!overrideMode && os !== "unknown" && (
            <p className="mt-6 text-center text-xs text-neutral-400">
              Not on {OS_LABELS[os]}?{" "}
              <a href="#all-platforms" className="underline hover:text-neutral-600">
                See all platforms <span aria-hidden="true">↓</span>
              </a>
            </p>
          )}
        </AnimatedReveal>

        {/* Platform Grid */}
        <section id="all-platforms" className="mt-14">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-6 text-center">
            All platforms
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {platforms.map((p, i) => {
              const isDetected = !overrideMode && p.id === detectedPlatformId;
              return (
                <AnimatedReveal key={p.id} delay={i * 0.05}>
                  <div
                    className={`relative bg-white/90 rounded-xl p-4 min-h-[56px] flex flex-col items-center gap-2 text-center transition-shadow duration-200 ${
                      isDetected
                        ? "ring-2 ring-violet-500 shadow-md"
                        : "ring-1 ring-neutral-200 hover:shadow-sm"
                    }`}
                  >
                    {isDetected && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-violet-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                        Recommended
                      </span>
                    )}
                    <div className="text-slate-600 mt-1">{p.icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{p.label}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{p.sublabel}</p>
                      {p.asset?.sizeLabel && (
                        <p className="text-[10px] text-neutral-400 mt-0.5">{p.asset.sizeLabel}</p>
                      )}
                    </div>
                    {p.asset ? (
                      <a
                        href={p.asset.downloadUrl}
                        className="mt-auto text-[11px] font-medium text-primary-700 underline hover:text-primary-900 focus-visible:ring-1 focus-visible:ring-primary-700 rounded"
                        aria-label={`Download ${p.label} ${p.sublabel}`}
                      >
                        Download
                      </a>
                    ) : release ? (
                      <a
                        href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-auto text-[11px] font-medium text-neutral-400 underline hover:text-neutral-600 focus-visible:ring-1 focus-visible:ring-neutral-400 rounded"
                      >
                        GitHub <span aria-hidden="true">↗</span>
                      </a>
                    ) : null}
                  </div>
                </AnimatedReveal>
              );
            })}

            {/* iOS tile */}
            <AnimatedReveal delay={platforms.length * 0.05}>
              <div className="relative bg-white/90 rounded-xl p-4 min-h-[56px] flex flex-col items-center gap-2 text-center ring-1 ring-neutral-200">
                <AppleIcon className={`${iconClass} text-slate-400 mt-1`} />
                <div>
                  <p className="text-sm font-semibold text-neutral-400">iOS</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">iPhone / iPad</p>
                </div>
                <a
                  href="https://journal.moodhaven.app"
                  className="mt-auto text-[11px] font-medium text-primary-700 underline hover:text-primary-900 focus-visible:ring-1 focus-visible:ring-primary-700 rounded"
                >
                  Open Web App
                </a>
              </div>
            </AnimatedReveal>
          </div>

          {/* Wear OS companion */}
          <div className="mt-4">
            <button
              onClick={() => setShowWear((v) => !v)}
              className="w-full text-left text-xs text-neutral-400 hover:text-neutral-600 flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-primary-700 rounded"
              aria-expanded={showWear}
              aria-controls="wear-section"
            >
              <WatchIcon className="w-3.5 h-3.5" />
              {showWear ? "Hide" : "Show"} Wear OS companion app
            </button>
            {showWear && (
              <div id="wear-section" className="mt-3">
                <div className="bg-white/90 rounded-xl p-4 ring-1 ring-neutral-200 flex items-center gap-4">
                  <WatchIcon className="w-8 h-8 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-800">Wear OS Companion</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Android watch · voice capture · mood taps
                    </p>
                  </div>
                  {wearAsset ? (
                    <a
                      href={wearAsset.downloadUrl}
                      className="flex-shrink-0 text-[11px] font-medium text-primary-700 underline hover:text-primary-900 focus-visible:ring-1 focus-visible:ring-primary-700 rounded"
                      aria-label="Download Wear OS APK"
                    >
                      Download APK
                    </a>
                  ) : (
                    <a
                      href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-[11px] font-medium text-neutral-400 underline hover:text-neutral-600"
                    >
                      GitHub <span aria-hidden="true">↗</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* No release fallback */}
        {!release && (
          <AnimatedReveal delay={0.2} className="mt-10 text-center">
            <p className="text-sm text-neutral-500 mb-4">
              No release data available yet.
            </p>
            <a
              href="https://github.com/kenlacroix/moodhaven-journal/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full bg-accent-cta text-neutral-900 px-6 py-4 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
            >
              View all releases on GitHub <span aria-hidden="true">↗</span>
            </a>
          </AnimatedReveal>
        )}

        {/* Trust signals */}
        <AnimatedReveal delay={0.3} className="mt-14 text-center text-xs text-neutral-400 flex flex-wrap justify-center gap-3">
          <a
            href="https://github.com/kenlacroix/moodhaven-journal"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-600 focus-visible:ring-1 focus-visible:ring-primary-700 rounded"
          >
            Open source
          </a>
          <span aria-hidden="true">·</span>
          <span>MIT license</span>
          <span aria-hidden="true">·</span>
          <Link href="/about" className="hover:text-neutral-600 focus-visible:ring-1 focus-visible:ring-primary-700 rounded">
            About MoodHaven
          </Link>
          <span aria-hidden="true">·</span>
          <a
            href="https://journal.moodhaven.app"
            className="hover:text-neutral-600 focus-visible:ring-1 focus-visible:ring-primary-700 rounded"
          >
            Open web app
          </a>
        </AnimatedReveal>

      </div>
    </main>
  );
}
