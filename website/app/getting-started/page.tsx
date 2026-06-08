import type { Metadata } from "next";
import { getLatestRelease } from "@/lib/getLatestRelease";
import GettingStartedClient from "./GettingStartedClient";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Getting Started",
  description:
    "New to MoodHaven Journal? Start in your browser in five seconds, or install the free desktop app in three simple steps. No account, no setup headaches.",
  alternates: { canonical: "https://www.moodhaven.app/getting-started" },
  openGraph: {
    title: "Getting Started with MoodHaven Journal",
    description:
      "Try it in your browser instantly, or install the free, private desktop app in three simple steps.",
    url: "https://www.moodhaven.app/getting-started",
    type: "website",
  },
};

export default async function GettingStartedPage() {
  const release = await getLatestRelease();
  return <GettingStartedClient release={release} />;
}
