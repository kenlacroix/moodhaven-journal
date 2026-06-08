"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AnimatedReveal from "@/components/AnimatedReveal";
import type { LatestRelease } from "@/lib/getLatestRelease";
import {
  detectOS,
  detectArch,
  getPrimaryAsset,
  type DetectedArch,
} from "@/lib/platformDetection";

const JOURNAL_URL = "https://journal.moodhaven.app";

// ─── Icons ────────────────────────────────────────────────────────────────────

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

// ─── Per-OS install content ─────────────────────────────────────────────────────

type DesktopOS = "windows" | "macos" | "linux";

interface OSGuide {
  id: DesktopOS;
  label: string;
  Icon: ({ className }: { className?: string }) => React.JSX.Element;
  fileLabel: string;
  openStep: string;
  warningTitle: string;
  warningBody: string;
}

const OS_GUIDES: OSGuide[] = [
  {
    id: "windows",
    label: "Windows",
    Icon: WindowsIcon,
    fileLabel: ".exe installer",
    openStep:
      "Double-click the downloaded file. The installer walks you through a few clicks — just press Next, then Install.",
    warningTitle: 'If you see “Windows protected your PC”',
    warningBody:
      "This is normal, not a virus. MoodHaven is a small open-source project, so it isn’t signed with a paid Microsoft certificate yet. Click “More info”, then “Run anyway”. You can read every line of the source on GitHub if you’d like to check first.",
  },
  {
    id: "macos",
    label: "macOS",
    Icon: AppleIcon,
    fileLabel: ".dmg disk image",
    openStep:
      "Open the downloaded .dmg and drag the MoodHaven icon into your Applications folder. Then open it from Launchpad or Applications.",
    warningTitle: "If macOS says the developer “cannot be verified”",
    warningBody:
      "This is expected for indie apps that aren’t paid into Apple’s notarization program. Instead of double-clicking, right-click (or Control-click) the app and choose “Open”, then “Open” again. You only have to do this once.",
  },
  {
    id: "linux",
    label: "Linux",
    Icon: LinuxIcon,
    fileLabel: ".AppImage (portable)",
    openStep:
      "Make the AppImage executable, then run it. Right-click → Properties → Permissions → “Allow executing as program”, then double-click. (Prefer a package? A .deb is on the downloads page.)",
    warningTitle: "No security warning — just a permission step",
    warningBody:
      "Linux doesn’t flag the app, but AppImages need permission to run. If you’d rather use the terminal: chmod +x MoodHaven*.AppImage && ./MoodHaven*.AppImage",
  },
];

// ─── Reusable bits ──────────────────────────────────────────────────────────────

const CHIPS = [
  "Free forever",
  "No account",
  "Open source",
  "Nothing leaves your device",
];

const GALLERY = [
  { src: "/images/app-writing-view.png", title: "Distraction-free writing", caption: "A calm editor that auto-saves as you go." },
  { src: "/images/app-timeline-view.png", title: "Everything in one timeline", caption: "Browse, search, and organize past entries." },
  { src: "/images/app-calendar-view.png", title: "Your mood at a glance", caption: "See patterns across days and weeks." },
  { src: "/images/app-insights-view.png", title: "Private, on-device insights", caption: "Reflections generated locally — never uploaded." },
];

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-500 text-white text-sm font-semibold flex items-center justify-center">
      {n}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function GettingStartedClient({ release }: { release: LatestRelease | null }) {
  const [activeOS, setActiveOS] = useState<DesktopOS>("windows");
  const [arch, setArch] = useState<DetectedArch>("unknown");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const detected = detectOS();
    setArch(detectArch());
    if (detected === "windows" || detected === "macos" || detected === "linux") {
      setActiveOS(detected);
    } else if (detected === "android" || detected === "ios") {
      setIsMobile(true);
    }
  }, []);

  const guide = OS_GUIDES.find((g) => g.id === activeOS) ?? OS_GUIDES[0];
  const asset = release ? getPrimaryAsset(release.assets, activeOS, arch) : undefined;
  const downloadHref = asset?.downloadUrl ?? "/download";

  return (
    <main
      id="main-content"
      className="bg-[var(--background)] text-[var(--foreground)] px-4 pt-10 pb-20"
    >
      <div className="max-w-3xl mx-auto space-y-20">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <AnimatedReveal>
          <section className="text-center">
            <p className="text-xs font-semibold text-primary-700 uppercase tracking-widest mb-3">
              New to MoodHaven?
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight mb-4">
              Start journaling in two minutes
            </h1>
            <p className="text-base md:text-lg text-neutral-600 leading-relaxed max-w-xl mx-auto mb-7">
              A private space to write — no account, no subscription, nothing sent to the cloud.
              Try it instantly in your browser, or install the free app on your computer.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <a
                href={JOURNAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-accent-cta text-neutral-900 px-6 py-3 text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
              >
                Try it in your browser <span aria-hidden="true">→</span>
              </a>
              <a
                href="#install"
                className="rounded-full bg-white text-neutral-800 px-6 py-3 text-sm font-semibold ring-1 ring-neutral-300 transition-all duration-200 hover:ring-primary-500 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                Install the app
              </a>
            </div>

            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-neutral-500">
              {CHIPS.map((c) => (
                <li key={c} className="flex items-center gap-1.5">
                  <span className="text-primary-500" aria-hidden="true">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          </section>
        </AnimatedReveal>

        {/* ── Hero illustration ────────────────────────────────── */}
        <AnimatedReveal>
          <div className="relative aspect-[3/2] rounded-2xl overflow-hidden ring-1 ring-neutral-200 shadow-sm bg-primary-50">
            <Image
              src="/images/getting-started/hero.webp"
              alt="A person writing peacefully in a journal at a sunlit desk"
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
              priority
            />
          </div>
        </AnimatedReveal>

        {/* ── Two ways to start ────────────────────────────────── */}
        <AnimatedReveal>
          <section>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-6 text-center">
              Two ways to start
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/90 rounded-xl p-6 ring-1 ring-neutral-200 flex flex-col">
                <div className="text-2xl mb-2" aria-hidden="true">🌱</div>
                <h3 className="text-base font-semibold text-neutral-900 mb-1">Just try it</h3>
                <p className="text-sm text-neutral-600 leading-relaxed flex-1">
                  Opens right in your browser. Nothing to download, nothing to set up —
                  perfect for a first look. Your entries stay on your device.
                </p>
                <a
                  href={JOURNAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 text-sm font-semibold text-primary-700 hover:underline"
                >
                  Open the web app <span aria-hidden="true">→</span>
                </a>
              </div>

              <div className="bg-white/90 rounded-xl p-6 ring-1 ring-neutral-200 flex flex-col">
                <div className="text-2xl mb-2" aria-hidden="true">💻</div>
                <h3 className="text-base font-semibold text-neutral-900 mb-1">Install the app</h3>
                <p className="text-sm text-neutral-600 leading-relaxed flex-1">
                  The full experience — voice notes, reminders, and syncing between your own
                  devices over your home network. Best for everyday journaling.
                </p>
                <a
                  href="#install"
                  className="mt-4 text-sm font-semibold text-primary-700 hover:underline"
                >
                  See the 3 steps <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
          </section>
        </AnimatedReveal>

        {/* ── Install in 3 steps ───────────────────────────────── */}
        <AnimatedReveal>
          <section id="install" className="scroll-mt-24">
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-2 text-center">
              Install in 3 steps
            </h2>
            <p className="text-sm text-neutral-500 text-center mb-6">
              {release ? `Latest version: ${release.version}` : "Pick your system below."}
            </p>

            {isMobile && (
              <div className="mb-6 rounded-xl bg-primary-50 ring-1 ring-primary-200 p-4 text-sm text-neutral-700">
                Looks like you’re on a phone. The desktop app installs on Windows, macOS, and Linux —
                open this page on your computer when you’re ready. In the meantime, the{" "}
                <a href={JOURNAL_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-700 hover:underline">
                  web app
                </a>{" "}
                works great on mobile too.
              </div>
            )}

            {/* OS tabs */}
            <div role="tablist" aria-label="Choose your operating system" className="flex gap-2 mb-6 justify-center">
              {OS_GUIDES.map((g) => {
                const active = g.id === activeOS;
                const Icon = g.Icon;
                return (
                  <button
                    key={g.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveOS(g.id)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                      active
                        ? "bg-primary-500 text-white"
                        : "bg-white text-neutral-700 ring-1 ring-neutral-200 hover:ring-primary-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {g.label}
                  </button>
                );
              })}
            </div>

            <ol className="space-y-4">
              {/* Step 1 — Download */}
              <li className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-200 flex items-start gap-4">
                <StepNumber n={1} />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1">Download for {guide.label}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed mb-3">
                    Grab the {guide.fileLabel}
                    {asset ? ` (${asset.sizeLabel})` : ""}.
                  </p>
                  <a
                    href={downloadHref}
                    {...(asset ? { rel: "noopener noreferrer" } : {})}
                    className="inline-flex items-center gap-2 rounded-full bg-primary-500 text-white px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    <guide.Icon className="w-4 h-4" />
                    Download for {guide.label}
                  </a>
                  {!asset && (
                    <p className="text-xs text-neutral-400 mt-2">
                      Opens the full downloads page with every option.
                    </p>
                  )}
                </div>
              </li>

              {/* Step 2 — Open */}
              <li className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-200 flex items-start gap-4">
                <StepNumber n={2} />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1">Open it</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{guide.openStep}</p>
                </div>
              </li>

              {/* Step 3 — The warning (trust-disarming) */}
              <li className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-200 flex items-start gap-4">
                <StepNumber n={3} />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1">{guide.warningTitle}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{guide.warningBody}</p>
                </div>
              </li>
            </ol>

            <p className="text-xs text-neutral-400 text-center mt-4">
              Want every file, checksum, or the mobile companion?{" "}
              <Link href="/download" className="text-primary-700 hover:underline">
                Visit the full downloads page
              </Link>
              .
            </p>
          </section>
        </AnimatedReveal>

        {/* ── First two minutes ────────────────────────────────── */}
        <AnimatedReveal>
          <section>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-6 text-center">
              Your first two minutes
            </h2>
            <div className="flex justify-center mb-6">
              <Image
                src="/images/getting-started/first-entry.webp"
                alt="A padlock opening into a journal, representing your private space unlocking"
                width={160}
                height={160}
                className="w-40 h-40 object-contain"
              />
            </div>
            <div className="space-y-4">
              <div className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-200 flex items-start gap-4">
                <StepNumber n={1} />
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1">Create your password</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    This password is the key that encrypts your journal. We never see it and it’s
                    never uploaded — which also means we can’t reset it for you. Pick something
                    memorable (a few random words works well), and consider saving a Recovery Key
                    in Settings later.
                  </p>
                </div>
              </div>
              <div className="bg-white/90 rounded-xl p-5 ring-1 ring-neutral-200 flex items-start gap-4">
                <StepNumber n={2} />
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-1">Write your first line</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    Pick how you’re feeling, type a sentence, and that’s it — your entry saves
                    itself automatically and encrypts on the way to disk. No “publish” button,
                    no accounts, no waiting.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </AnimatedReveal>

        {/* ── What you'll get ──────────────────────────────────── */}
        <AnimatedReveal>
          <section>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-6 text-center">
              What you’ll get
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {GALLERY.map((g, i) => (
                <AnimatedReveal key={g.src} delay={i * 0.08}>
                  <figure className="bg-white/90 rounded-xl ring-1 ring-neutral-200 overflow-hidden">
                    <div className="relative aspect-[16/10] bg-primary-50">
                      <Image
                        src={g.src}
                        alt={g.title}
                        fill
                        sizes="(max-width: 640px) 100vw, 384px"
                        className="object-cover object-top"
                      />
                    </div>
                    <figcaption className="p-4">
                      <h3 className="text-sm font-semibold text-neutral-900">{g.title}</h3>
                      <p className="text-xs text-neutral-500 mt-0.5">{g.caption}</p>
                    </figcaption>
                  </figure>
                </AnimatedReveal>
              ))}
            </div>
          </section>
        </AnimatedReveal>

        {/* ── Trust band ───────────────────────────────────────── */}
        <AnimatedReveal>
          <section className="bg-primary-50 rounded-2xl p-6 lg:p-8 text-center">
            <h2 className="text-base font-semibold text-neutral-900 mb-2">
              You don’t have to take our word for it
            </h2>
            <p className="text-sm text-neutral-600 leading-relaxed max-w-xl mx-auto mb-5">
              MoodHaven is fully open source. Every line — including the encryption — is public,
              so anyone can verify it does exactly what we say: keep your journal private,
              on your device, encrypted with a key only you hold.
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-sm font-medium">
              <a
                href="https://github.com/kenlacroix/moodhaven-journal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-700 hover:underline"
              >
                Read the source ↗
              </a>
              <a
                href="https://github.com/kenlacroix/moodhaven-journal/blob/main/SECURITY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-700 hover:underline"
              >
                Security model ↗
              </a>
              <Link href="/faq" className="text-primary-700 hover:underline">
                Read the FAQ →
              </Link>
            </div>
          </section>
        </AnimatedReveal>

        {/* ── Final CTA ────────────────────────────────────────── */}
        <AnimatedReveal>
          <section className="text-center">
            <h2 className="text-2xl font-bold text-neutral-900 mb-3">Ready when you are</h2>
            <p className="text-sm text-neutral-600 mb-6">
              Start in your browser now, or install the app — either way it’s free, and your
              words stay yours.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={JOURNAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-accent-cta text-neutral-900 px-6 py-3 text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
              >
                Try it in your browser <span aria-hidden="true">→</span>
              </a>
              <Link
                href="/download"
                className="rounded-full bg-white text-neutral-800 px-6 py-3 text-sm font-semibold ring-1 ring-neutral-300 transition-all duration-200 hover:ring-primary-500 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                All downloads
              </Link>
            </div>
          </section>
        </AnimatedReveal>

      </div>
    </main>
  );
}
