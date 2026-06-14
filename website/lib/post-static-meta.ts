// Static post metadata for edge-runtime routes (e.g. OG image generation).
// lib/posts.ts uses fs.readFileSync which is unavailable in Cloudflare Workers.
// Keep this in sync when adding or editing blog posts.
export interface PostStaticMeta {
  title: string;
  excerpt: string;
}

export const POST_STATIC_META: Record<string, PostStaticMeta> = {
  "breaking-into-our-own-app-on-a-real-phone": {
    title: "We Tried to Break Into Our Own App — On a Real Phone",
    excerpt:
      "We installed MoodHaven on an everyday Android phone and spent a day trying to read your journal, steal your password, and intercept your data. Your entries stayed encrypted, your text never left the device, and biometric unlock held. Here's the honest accounting — including the small things we tightened up.",
  },
  "what-happens-when-you-change-your-password": {
    title: "What Changing Your Password Actually Does — and Why It's Safe to Interrupt",
    excerpt:
      "In MoodHaven your password isn't stored anywhere — it's the key that unlocks everything. So changing it re-encrypts your whole journal. Here's what that means, and why an interrupted change always rolls back cleanly to your old password.",
  },
  "stress-testing-the-privacy-in-your-journal": {
    title: "How We Stress-Tested the Privacy in Your Journal — Ten Rounds of Attacks",
    excerpt:
      "Ten rounds of real attacks against our own private journaling app, on tools we built from scratch. The one thing it exists to protect — your entries — was never exposed. Here's the honest accounting.",
  },
  "why-i-built-moodhaven": {
    title: "Why I Built MoodHaven",
    excerpt:
      "Most journaling apps quietly harvest your data or tie you to someone else's server. I wanted something different — a journal that truly belongs to you.",
  },
  "how-moodhaven-protects-your-journal": {
    title: "How MoodHaven Protects Your Journal",
    excerpt:
      "A deep look at the encryption model that keeps your entries private — even from us.",
  },
  "our-privacy-philosophy-at-moodhaven": {
    title: "Our Privacy Philosophy at MoodHaven",
    excerpt:
      "Privacy isn't a feature. It's the foundation. Here's what that means in practice.",
  },
  "protecting-the-pause": {
    title: "Protecting the Pause",
    excerpt:
      "Journaling only works if you feel safe being honest. Here's how MoodHaven protects that space.",
  },
  "the-moodhaven-roadmap-whats-next": {
    title: "The MoodHaven Roadmap: What's Next",
    excerpt:
      "A look at where MoodHaven Journal is heading — peer sync, mobile, and beyond.",
  },
  "first-look-moodhavens-mobile-companion": {
    title: "First Look: MoodHaven's Mobile Companion",
    excerpt:
      "A sneak peek at the Android app that brings private journaling to your pocket.",
  },
  "welcome-to-moodhaven-journal": {
    title: "Welcome to MoodHaven Journal",
    excerpt:
      "MoodHaven Journal is now available — free, open source, and built for privacy.",
  },
  "how-moodhaven-insights-will-work": {
    title: "How MoodHaven Insights Work",
    excerpt:
      "AI-powered reflections that run entirely on your device, never sending your words to any server.",
  },
  "choosing-self-hosting-for-journals": {
    title: "Why We Chose Self-Hosting for Journals",
    excerpt:
      "The case for keeping your most personal data off someone else's cloud.",
  },
  "reflections-on-building-moodhaven": {
    title: "Reflections on Building MoodHaven",
    excerpt:
      "What I learned building a privacy-first app in public — the hard parts, the surprises, and what's next.",
  },
  "moodhaven-mobile-alpha-early-access": {
    title: "MoodHaven Mobile Alpha: Early Access",
    excerpt:
      "The Android companion app is ready for early testers. Here's how to get in.",
  },
};
