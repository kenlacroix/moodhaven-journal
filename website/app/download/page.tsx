import type { Metadata } from "next";
import { getLatestRelease } from "@/lib/getLatestRelease";
import DownloadClient from "./DownloadClient";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download MoodHaven Journal for Windows, macOS, or Linux. Or open the free web app — no install required. Free, open-source, privacy-first.",
  alternates: { canonical: "https://www.moodhaven.app/download" },
  openGraph: {
    title: "Download MoodHaven Journal",
    description:
      "Free desktop app for Windows, macOS, and Linux. Or use the web app — no install needed.",
    url: "https://www.moodhaven.app/download",
    type: "website",
  },
};

export default async function DownloadPage() {
  const release = await getLatestRelease();
  return <DownloadClient release={release} />;
}
