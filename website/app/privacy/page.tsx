import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — MoodHaven Journal',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-gray-800 space-y-10">
      <h1 className="text-3xl font-bold text-blue-700 text-center">Privacy Policy</h1>
      <p className="text-sm text-gray-400 text-center">Last updated: April 2026</p>

      <div className="space-y-8">

        <div>
          <h2 className="font-semibold text-lg text-blue-600">What we collect</h2>
          <p>
            MoodHaven Journal is designed to collect as little as possible. The journal app
            itself stores all your entries locally on your device — nothing is sent to our servers.
            If you sign up for desktop app notifications via the waitlist form, we collect your
            email address and any information you choose to provide. That data is processed by
            Formspree and is used only to notify you when the desktop app is available.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-blue-600">Journal data</h2>
          <p>
            Your journal entries are encrypted on your device using AES-256-GCM before being
            stored. We have no access to your entries, your encryption key, or your password.
            When you use the web app at <a href="https://journal.moodhaven.app" className="text-blue-600 underline">journal.moodhaven.app</a>,
            your data is stored in your browser's IndexedDB — it never leaves your device.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-blue-600">This website</h2>
          <p>
            moodhaven.app is hosted on Cloudflare Pages. Cloudflare may collect standard web
            analytics (page views, referrers, general geographic region) in aggregate form.
            We do not use cookies, ad trackers, or third-party analytics on this site.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-blue-600">Third-party services</h2>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong>Formspree</strong> — processes waitlist form submissions</li>
            <li><strong>Substack</strong> — newsletter and blog posts</li>
            <li><strong>Cloudflare</strong> — hosting and CDN</li>
          </ul>
          <p className="mt-2">Each service has its own privacy policy.</p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-blue-600">Contact</h2>
          <p>
            Questions? Reach out via{' '}
            <a href="https://github.com/kenlacroix/moodhaven-journal" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>{' '}
            or the newsletter.
          </p>
        </div>

      </div>
    </div>
  );
}
