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

function freshnessLabel(days: number): string {
  if (days === 0) return "Released today";
  if (days === 1) return "Released yesterday";
  return `Released ${days} days ago`;
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
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {release?.version && (
              <span className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-700 border border-primary-200 text-xs font-semibold px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 inline-block" aria-hidden="true" />
                {release.version} — latest
              </span>
            )}
            {days !== null && (
              <span className="inline-flex items-center text-xs text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">
                {freshnessLabel(days)}
              </span>
            )}
            {primaryAsset?.checksumVerified !== false && (
              <span className="inline-flex items-center gap-1 text-xs text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">✓ SHA-256 verified</span>
            )}
            {release?.virusTotalUrl && (
              <a
                href={release.virusTotalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full hover:text-neutral-700 hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-primary-700"
              >
                ✓ VirusTotal scanned
              </a>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">✓ No account required</span>
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">✓ MIT licensed</span>
          </div>
        </AnimatedReveal>

        {/* Update notice — encryption at rest (1.8.0) */}
        <AnimatedReveal delay={0.05} className="mt-8">
          <div className="rounded-xl bg-primary-50 ring-1 ring-primary-200 p-5 text-left">
            <p className="text-sm font-semibold text-neutral-900 mb-1">
              Update to 1.8.0
            </p>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Database encryption at rest is now active on disk — we verified it on the
              shipped build. In versions before 1.8.0 that layer didn&apos;t engage: your entry
              text stayed encrypted, but some metadata (mood, dates, tags) was readable if
              someone had the database file.{" "}
              <Link
                href="/blog/stress-testing-the-privacy-in-your-journal"
                className="font-medium text-primary-700 underline hover:text-primary-900"
              >
                Read the details →
              </Link>
            </p>
          </div>
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
                  {primaryAsset.name} · {primaryAsset.sizeLabel}{primaryAsset.checksumVerified !== false ? ' · SHA-256 verified' : ''}
                </p>
              )}
              {os === "macos" && macSecondaryAsset && (
                <p className="mt-1 text-xs text-neutral-500">
                  On an Intel Mac?{" "}
                  <a
                    href={macSecondaryAsset.downloadUrl}
                    className="underline hover:text-neutral-700"
                  >
                    Download the Intel build
                  </a>
                </p>
              )}
            </div>
          ) : os === "android" ? (
            /* Android — no Play Store yet, offer sideload APK */
            <div className="space-y-5">
              <div className="bg-primary-50 rounded-xl p-5 text-left">
                <h3 className="text-sm font-semibold text-neutral-900 mb-1">
                  Install via sideload
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed mb-4">
                  MoodHaven isn&apos;t on the Play Store yet. You can install it directly from the APK — takes about 60 seconds.
                </p>
                <ol className="space-y-2 text-sm text-neutral-600 list-decimal list-inside leading-relaxed">
                  <li>
                    Go to <strong>Settings → Apps → Special app access → Install unknown apps</strong> and enable it for your browser.
                  </li>
                  <li>Download the APK from GitHub Releases below.</li>
                  <li>Open the downloaded file and tap <strong>Install</strong>.</li>
                </ol>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-center rounded-full bg-accent-cta text-neutral-900 px-6 py-3 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
                >
                  Download APK from GitHub <span aria-hidden="true">↗</span>
                </a>
                <a
                  href="https://journal.moodhaven.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-center rounded-full border border-neutral-300 bg-white text-neutral-900 px-6 py-3 text-sm font-semibold hover:bg-neutral-50 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
                >
                  Use web app instead <span aria-hidden="true">→</span>
                </a>
              </div>
              <p className="text-center text-xs text-neutral-400">
                Play Store listing coming soon. Watch{" "}
                <a
                  href="https://github.com/kenlacroix/moodhaven-journal/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-600"
                >
                  GitHub Releases
                </a>{" "}
                for updates.
              </p>
            </div>
          ) : (
            /* release is null (fetch failed) or no matching asset for this platform */
            <div className="text-center">
              <a
                href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full bg-accent-cta text-neutral-900 px-6 py-4 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
              >
                Download from GitHub Releases <span aria-hidden="true">↗</span>
              </a>
              <p className="mt-2 text-xs text-neutral-500">
                Find the installer for {OS_LABELS[os]} in the assets list.
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Or{" "}
                <a
                  href="https://journal.moodhaven.app"
                  className="underline hover:text-neutral-600"
                >
                  use the web app
                </a>{" "}
                — no install needed.
              </p>
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
                    ) : (
                      <a
                        href="https://github.com/kenlacroix/moodhaven-journal/releases/latest"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-auto text-[11px] font-medium text-primary-700 underline hover:text-primary-900 focus-visible:ring-1 focus-visible:ring-primary-700 rounded"
                      >
                        GitHub Releases <span aria-hidden="true">↗</span>
                      </a>
                    )}
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

        {/* Verify your download */}
        <AnimatedReveal delay={0.25} className="mt-14">
          <details className="group rounded-xl bg-neutral-50 ring-1 ring-neutral-200 p-5 text-left">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-sm font-semibold text-neutral-900 focus-visible:ring-2 focus-visible:ring-primary-700 rounded">
              <span>Verify your download</span>
              <span className="text-neutral-400 transition-transform duration-200 group-open:rotate-180" aria-hidden="true">⌄</span>
            </summary>
            <div className="mt-3 space-y-3 text-sm text-neutral-600 leading-relaxed">
              <p>
                MoodHaven isn&apos;t code-signed yet, so Windows SmartScreen may say
                &quot;unknown publisher&quot; and macOS Gatekeeper may warn the build is
                unverified. That&apos;s expected for an unsigned open-source app — not a sign
                of tampering. Every release ships three independent ways to check the bytes
                you downloaded:
              </p>
              <ul className="space-y-2 list-disc pl-5">
                <li>
                  <span className="font-medium text-neutral-800">SHA-256 checksums</span> —
                  compare your file against{" "}
                  <a
                    href={release?.releaseUrl ?? "https://github.com/kenlacroix/moodhaven-journal/releases/latest"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-700 underline hover:text-primary-900"
                  >
                    checksums.txt
                  </a>{" "}
                  (<code className="text-xs">shasum -a 256</code> /{" "}
                  <code className="text-xs">Get-FileHash</code>).
                </li>
                <li>
                  <span className="font-medium text-neutral-800">Minisign signature</span> —
                  each installer has a <code className="text-xs">.sig</code> signed with our
                  release key — the same key the in-app updater verifies before installing.
                </li>
                <li>
                  <span className="font-medium text-neutral-800">VirusTotal</span> — every
                  release attaches{" "}
                  <a
                    href={release?.releaseUrl ?? "https://github.com/kenlacroix/moodhaven-journal/releases/latest"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-700 underline hover:text-primary-900"
                  >
                    virustotal.txt
                  </a>{" "}
                  linking a public multi-engine scan report for each installer.
                </li>
              </ul>
            </div>
          </details>
        </AnimatedReveal>

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
