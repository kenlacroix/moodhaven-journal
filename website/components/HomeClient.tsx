// components/HomeClient.tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AnimatedReveal from "./AnimatedReveal";
import PrivacyCallout from "./PrivacyCallout";
import FeaturesGrid from "./FeaturesGrid";
import CommunityCallout from "./CommunityCallout";

const HeroParticles = dynamic(() => import("./HeroParticles"), {
  ssr: false,
});

export default function HomeClient() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative text-white py-16 md:py-28 overflow-hidden md:mask-fade-edges">
        <img
          src="/hero-rain.jpg"
          alt=""
          role="presentation"
          className="absolute inset-0 w-full h-full object-cover object-top z-0"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-blue-100/10 to-transparent z-0 pointer-events-none" />
        {!isMobile && <HeroParticles />}

        <AnimatedReveal className="relative z-10 max-w-4xl mx-auto text-center px-4 py-8 md:py-10 backdrop-blur-md bg-white/5 rounded-2xl shadow-xl shadow-blue-900/10">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            Your Private Journal That Stays Yours
          </h1>
          <p className="text-lg md:text-xl text-blue-100 mt-2">
            No accounts. No cloud required. Unlike Day One or Notion, your entries never leave your device — AI insights from your moods, not your words.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-6 pt-6">
            <div className="flex flex-col items-center gap-2">
              <a
                href="https://journal.moodhaven.app"
                className="w-full sm:w-auto text-center rounded-full bg-accent-cta text-neutral-900 px-6 py-4 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
              >
                Open in Browser <span aria-hidden="true">→</span>
              </a>
              <p className="text-xs text-blue-100/70 max-w-[160px]">
                Start writing in 10 seconds, nothing to install.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <a
                href="/download"
                className="w-full sm:w-auto text-center rounded-full bg-white text-primary-700 px-6 py-4 text-sm font-semibold shadow transition-all duration-200 ease-out hover:bg-primary-100 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60"
              >
                Download for Desktop <span aria-hidden="true">↓</span>
              </a>
              <p className="text-xs text-blue-100/70 max-w-[160px]">
                Your data stays on your computer. Full features. Always free.
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-blue-100/70">
            Free to download. Pro features coming soon.
          </p>
        </AnimatedReveal>
      </section>

      <PrivacyCallout />
      <FeaturesGrid />
      <CommunityCallout />
    </div>
  );
}
