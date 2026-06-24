export const runtime = "edge";

import { renderOgImage, ogSize as size, ogContentType as contentType } from "@/lib/ogImage";

export { size, contentType };

export default function Image() {
  return renderOgImage("Frequently Asked Questions", "How MoodHaven keeps your journal private, encrypted, and yours");
}
