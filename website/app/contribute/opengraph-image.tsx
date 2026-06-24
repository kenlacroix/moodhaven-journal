export const runtime = "edge";

import { renderOgImage, ogSize as size, ogContentType as contentType } from "@/lib/ogImage";

export { size, contentType };

export default function Image() {
  return renderOgImage("Contribute", "Help build a privacy-first, open-source journal — code, testing, writing, advocacy");
}
