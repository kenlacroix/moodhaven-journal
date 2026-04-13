import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — MoodHaven Journal",
  description: "MoodHaven Journal is a privacy-first, open-source journaling app built on one belief: your thoughts should stay yours.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
