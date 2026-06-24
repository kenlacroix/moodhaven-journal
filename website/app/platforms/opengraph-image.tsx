export const runtime = "edge";

import { renderOgImage, ogSize as size, ogContentType as contentType } from "@/lib/ogImage";

export { size, contentType };

export default function Image() {
  return renderOgImage("Platform Availability", "Windows · macOS · Linux · Browser · Wear OS companion");
}
