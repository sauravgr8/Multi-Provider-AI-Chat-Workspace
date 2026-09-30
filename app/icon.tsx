import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: 64, height: 64, background: "#386b4d", color: "#f2f8e8", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, fontSize: 45, fontFamily: "serif" }}>S</div>,
    size,
  );
}