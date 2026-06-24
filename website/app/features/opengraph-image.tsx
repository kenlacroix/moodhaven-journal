export const runtime = "edge";

import { renderOgImage, ogSize as size, ogContentType as contentType } from "@/lib/ogImage";

export { size, contentType };

export default function Image() {
  return renderOgImage("Features", "Mood tracking, AI insights, encryption, sync — everything MoodHaven does");
}
