// app/page.tsx
import type { Metadata } from "next";
import { getLatestRelease } from "@/lib/getLatestRelease";
import HomeClient from "@/components/HomeClient";

// Fetch the latest release on every request — GitHub is the source of truth.
export const runtime = "edge";

export const metadata: Metadata = {
  title: "MoodHaven Journal — Privacy-First Journaling App",
  description:
    "MoodHaven Journal is a free, open-source journaling app with mood tracking and AI insights. Your data stays on your device — always encrypted, never shared.",
  alternates: {
    canonical: "https://www.moodhaven.app",
  },
  openGraph: {
    title: "MoodHaven Journal — Privacy-First Journaling App",
    description:
      "Free, open-source journaling with mood tracking and AI insights. Your data stays on your device — always encrypted, never shared.",
    url: "https://www.moodhaven.app",
    type: "website",
  },
};

export default async function Home() {
  const release = await getLatestRelease();
  return <HomeClient latestRelease={release} />;
}
