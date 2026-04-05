import type { Metadata } from "next";
import { getLatestRelease } from "@/lib/getLatestRelease";
import DownloadClient from "./DownloadClient";

export const metadata: Metadata = {
  title: "Download MoodHaven Journal",
  description:
    "Download MoodHaven Journal for Windows, macOS, Linux, or Android. Or open the web app — no install required.",
};

export default async function DownloadPage() {
  const release = await getLatestRelease();
  return <DownloadClient release={release} />;
}
