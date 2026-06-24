import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/**
 * Shared OpenGraph image in the warm MoodHaven brand style.
 * Pass a page title and a one-line subtitle.
 */
export function renderOgImage(title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background:
            "linear-gradient(160deg, #faf9f7 0%, #f3ede8 50%, #ede6df 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -60,
            width: 320,
            height: 320,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 70%)",
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
              background: "#8b5cf6",
            }}
          />
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#7c3aed",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            MoodHaven Journal
          </div>
        </div>

        {/* Title — large display */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: "#1c1917",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            flex: 1,
            display: "flex",
            alignItems: "center",
            maxWidth: 980,
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            color: "#78716c",
            lineHeight: 1.5,
            maxWidth: 880,
            marginBottom: 44,
          }}
        >
          {subtitle}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(120,113,108,0.2)",
            paddingTop: 24,
          }}
        >
          <div style={{ fontSize: 17, color: "#8b5cf6", fontWeight: 600 }}>
            moodhaven.app
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#7c3aed",
              background: "rgba(139,92,246,0.08)",
              border: "1px solid rgba(139,92,246,0.2)",
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
    { ...ogSize }
  );
}
