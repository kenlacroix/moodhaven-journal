// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Script from "next/script";
import packageJson from "../package.json";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.moodhaven.app"),
  title: {
    default: "MoodHaven Journal — Privacy-First Journaling App",
    template: "%s — MoodHaven Journal",
  },
  description:
    "MoodHaven Journal is a free, open-source journaling app with mood tracking and AI insights. Your data stays on your device — always encrypted, never shared.",
  keywords: [
    "journaling app",
    "privacy-first journal",
    "mood tracking",
    "open source journal",
    "encrypted journal",
    "local-first app",
    "mental health journal",
    "daily journal",
  ],
  authors: [{ name: "MoodHaven" }],
  creator: "MoodHaven",
  alternates: {
    canonical: "https://www.moodhaven.app",
    types: {
      "application/rss+xml": [
        { url: "https://www.moodhaven.app/blog/rss.xml", title: "MoodHaven Journal Blog" },
      ],
    },
  },
  openGraph: {
    title: "MoodHaven Journal — Privacy-First Journaling App",
    description:
      "A free, open-source journaling app with mood tracking and AI insights. Your data stays on your device — always encrypted, never shared.",
    url: "https://www.moodhaven.app",
    siteName: "MoodHaven Journal",
    images: [
      {
        url: "/icons/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "MoodHaven Journal — Privacy-First Desktop Journaling",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MoodHaven Journal — Privacy-First Journaling App",
    description:
      "Free, open-source journaling with mood tracking. Your data stays yours — encrypted on your device.",
    images: ["/icons/opengraph-image.png"],
    creator: "@moodhavenapp",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon.ico", type: "image/x-icon" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* JSON-LD for Organization & WebSite */}
        <Script id="ld-json" type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Person",
                "@id": "https://www.moodhaven.app/#ken",
                "name": "Ken LaCroix",
                "url": "https://www.kennethlacroix.me",
                "jobTitle": "Creator & Maintainer",
                "sameAs": [
                  "https://www.kennethlacroix.me",
                  "https://github.com/kenlacroix"
                ]
              },
              {
                "@type": "Organization",
                "@id": "https://www.moodhaven.app/#org",
                "name": "MoodHaven Journal",
                "url": "https://www.moodhaven.app",
                "logo": "https://www.moodhaven.app/icons/opengraph-image.png",
                "founder": { "@id": "https://www.moodhaven.app/#ken" },
                "sameAs": [
                  "https://github.com/kenlacroix/moodhaven-journal",
                  "https://moodhaven.substack.com",
                  "https://x.com/moodhavenapp",
                  "https://bsky.app/profile/moodhavenapp.bsky.social",
                  "https://www.linkedin.com/company/moodhavenapp/"
                ]
              },
              {
                "@type": "WebSite",
                "@id": "https://www.moodhaven.app/#website",
                "url": "https://www.moodhaven.app",
                "name": "MoodHaven Journal",
                "publisher": { "@id": "https://www.moodhaven.app/#org" },
                "potentialAction": {
                  "@type": "SearchAction",
                  "target": "https://www.moodhaven.app/blog?q={search_term_string}",
                  "query-input": "required name=search_term_string"
                }
              },
              {
                "@type": "SoftwareApplication",
                "@id": "https://www.moodhaven.app/#app",
                "name": "MoodHaven Journal",
                "description": "A free, open-source journaling app with mood tracking and AI insights. Your data stays on your device — always encrypted, never shared.",
                "url": "https://www.moodhaven.app",
                "applicationCategory": "LifestyleApplication",
                "operatingSystem": "Windows, macOS, Linux",
                "offers": {
                  "@type": "Offer",
                  "price": "0",
                  "priceCurrency": "USD"
                },
                "author": { "@id": "https://www.moodhaven.app/#org" },
                "screenshot": "https://www.moodhaven.app/icons/opengraph-image.png",
                "softwareVersion": packageJson.version,
                "license": "https://opensource.org/licenses/MIT"
              }
            ]
          })}
        </Script>
      </head>
      <body
        className={`min-h-screen bg-[#F3F0EA] text-[var(--foreground)] antialiased ${inter.variable}`}
      >
        {/* Skip link for keyboard & screen-reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white px-4 py-2 rounded shadow"
        >
          Skip to main content
        </a>

        <div className="min-h-screen flex flex-col items-center justify-start px-4 sm:px-6 lg:px-8 py-8">
          <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl overflow-visible">
            <NavBar />
            {/* main gets the skip-link target */}
            <main id="main-content">{children}</main>
            <Footer />
          </div>
        </div>
      </body>
    </html>
  );
}
