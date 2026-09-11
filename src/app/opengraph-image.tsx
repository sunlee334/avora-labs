import { ImageResponse } from "next/og";

export const alt = "PAROS — FOR EVERY MOVEMENT";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#afc8d8",
          backgroundImage: "linear-gradient(135deg, #cfdfe8 0%, #afc8d8 55%, #8fb0c6 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 12,
            color: "#2b2f34",
            marginBottom: 28,
          }}
        >
          FOR EVERY MOVEMENT
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 148,
            fontWeight: 600,
            letterSpacing: 18,
            color: "#1e2124",
          }}
        >
          PAROS
        </div>
      </div>
    ),
    { ...size },
  );
}
