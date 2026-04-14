import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "MoodHaven Journal is a privacy-first, open-source journaling app built on one belief: your thoughts should stay yours — not ours, not anyone else's.",
  alternates: { canonical: "https://www.moodhaven.app/about" },
  openGraph: {
    title: "About MoodHaven Journal",
    description:
      "A free, open-source journaling app built on privacy. No accounts, no cloud, no ads — just you and your thoughts.",
    url: "https://www.moodhaven.app/about",
    type: "website",
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
