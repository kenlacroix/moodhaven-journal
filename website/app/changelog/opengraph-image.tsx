export const runtime = "edge";

import { ImageResponse } from "next/og";
import { getLatestRelease } from "@/lib/getLatestRelease";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const release = await getLatestRelease();
  const version = release?.version ?? null;

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
        {/* Background glow — top right */}
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
        {/* Background glow — bottom left */}
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

        {/* Title + version badge row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 24,
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 58,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.15,
              display: "flex",
              alignItems: "center",
            }}
          >
            Changelog
          </div>
          {version !== null && (
            <div
              style={{
                marginTop: 14,
                fontSize: 18,
                fontWeight: 700,
                color: "#a78bfa",
                background: "rgba(139,92,246,0.18)",
                border: "1px solid rgba(167,139,250,0.35)",
                padding: "6px 20px",
                borderRadius: 999,
                letterSpacing: "0.04em",
                display: "flex",
                alignItems: "center",
              }}
            >
              {version}
            </div>
          )}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            color: "#c4b5fd",
            lineHeight: 1.5,
            maxWidth: 860,
            marginBottom: 44,
          }}
        >
          What&apos;s new in every release — features, fixes, security updates
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
