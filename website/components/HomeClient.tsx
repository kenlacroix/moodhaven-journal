// components/HomeClient.tsx
"use client";

import Image from "next/image";
import AnimatedReveal from "./AnimatedReveal";
import PrivacyCallout from "./PrivacyCallout";
import FeaturesGrid from "./FeaturesGrid";
import CommunityCallout from "./CommunityCallout";
import AppPreview from "./AppPreview";
import PrivacyProof from "./PrivacyProof";
import FeatureTabs from "./FeatureTabs";

export default function HomeClient() {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative text-white py-16 md:py-24 overflow-hidden">
        {/* Violet gradient background — on-brand, no external photo */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 z-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.3)_0%,_transparent_60%)] z-0 pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto px-4">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            {/* Copy block */}
            <AnimatedReveal className="flex-1 text-center lg:text-left">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
                Your Private Journal That Stays Yours
              </h1>
              <p className="text-lg md:text-xl text-primary-200 mt-4 max-w-lg mx-auto lg:mx-0">
                Local-first journaling with mood tracking and AI insights — all on your device. No accounts, no cloud, no compromises.
              </p>

              <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-4 pt-8">
                <div className="flex flex-col items-center lg:items-start gap-1.5">
                  <a
                    href="https://journal.moodhaven.app"
                    className="w-full sm:w-auto text-center rounded-full bg-accent-cta text-neutral-900 px-6 py-3.5 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
                  >
                    Open in Browser <span aria-hidden="true">→</span>
                  </a>
                  <p className="text-xs text-primary-300 max-w-[160px] text-center lg:text-left">
                    Start writing in 10 seconds, nothing to install.
                  </p>
                </div>
                <div className="flex flex-col items-center lg:items-start gap-1.5">
                  <a
                    href="/download"
                    className="w-full sm:w-auto text-center rounded-full bg-white text-primary-700 px-6 py-3.5 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-primary-100 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60"
                  >
                    Download for Desktop <span aria-hidden="true">↓</span>
                  </a>
                  <p className="text-xs text-primary-300 max-w-[160px] text-center lg:text-left">
                    Windows, macOS, Linux. Full features. Always free.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center lg:items-start gap-2">
                <p className="text-sm text-primary-300">
                  Free and open source. No account, no subscription, no cloud required.
                </p>
                <a
                  href="https://github.com/kenlacroix/moodhaven-journal"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Star MoodHaven Journal on GitHub"
                >
                  <img
                    src="https://img.shields.io/github/stars/kenlacroix/moodhaven-journal?style=social"
                    alt="GitHub stars"
                    className="h-4"
                  />
                </a>
              </div>
            </AnimatedReveal>

            {/* App screenshot — side-by-side on lg+, stacked below copy on smaller screens */}
            <AnimatedReveal className="w-full lg:shrink-0 lg:w-[460px]" delay={0.15}>
              {/* Glow halo behind the screenshot */}
              <div className="relative max-w-sm mx-auto lg:max-w-none">
                <div
                  className="absolute -inset-3 rounded-2xl opacity-40 blur-2xl pointer-events-none"
                  style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.6) 0%, rgba(91,33,182,0.3) 60%, transparent 100%)" }}
                  aria-hidden="true"
                />
                <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-primary-950/60 ring-1 ring-white/20">
                  <Image
                    src="/images/writing-view.png"
                    alt="MoodHaven Journal — writing view with mood selector and rich text editor"
                    width={960}
                    height={640}
                    className="w-full h-auto"
                    priority
                  />
                </div>
              </div>
            </AnimatedReveal>
          </div>
        </div>
      </section>

      <AppPreview />
      <PrivacyCallout />
      <FeaturesGrid />
      <FeatureTabs />
      <PrivacyProof />
      <CommunityCallout />
    </div>
  );
}
