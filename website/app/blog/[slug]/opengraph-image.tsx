// app/blog/[slug]/opengraph-image.tsx
// Generates a 1200×630 OG card for every blog post.
// Must use edge runtime — Cloudflare Pages does not support Node.js runtime routes.
// Post metadata is sourced from lib/post-static-meta.ts (no fs dependency).

export const runtime = "edge";

import { ImageResponse } from "next/og";
import { POST_STATIC_META } from "@/lib/post-static-meta";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const post = POST_STATIC_META[slug];
  const title = post?.title ?? "MoodHaven Journal";
  const excerpt =
    post?.excerpt ??
    "Privacy-first journaling with mood tracking and AI insights.";

  const truncatedExcerpt =
    excerpt.length > 130 ? excerpt.slice(0, 130).trim() + "…" : excerpt;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background:
            "linear-gradient(135deg, #0f0520 0%, #1e0a3c 40%, #2d1259 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 560,
            height: 560,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(109,40,217,0.4) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 360,
            height: 360,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Brand label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 52,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#a78bfa",
            }}
          />
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#a78bfa",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            MoodHaven Journal
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 52 ? 46 : 58,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.15,
            flex: 1,
            display: "flex",
            alignItems: "center",
            maxWidth: 960,
          }}
        >
          {title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            fontSize: 22,
            color: "#c4b5fd",
            lineHeight: 1.55,
            maxWidth: 860,
            marginBottom: 44,
          }}
        >
          {truncatedExcerpt}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(167,139,250,0.2)",
            paddingTop: 24,
          }}
        >
          <div
            style={{
              fontSize: 17,
              color: "#7c3aed",
              fontWeight: 600,
            }}
          >
            moodhaven.app
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#8b5cf6",
              background: "rgba(139,92,246,0.15)",
              border: "1px solid rgba(139,92,246,0.3)",
              padding: "6px 18px",
              borderRadius: 999,
              fontWeight: 600,
              letterSpacing: "0.05em",
            }}
          >
            Privacy-First · Open Source
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
