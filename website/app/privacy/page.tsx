import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'MoodHaven Journal privacy policy — how we handle your data (short answer: we don\'t collect any). Your journal stays on your device, encrypted, always.',
  alternates: { canonical: 'https://www.moodhaven.app/privacy' },
};

export default function PrivacyPage() {
  return (
    <main id="main-content" className="bg-[var(--background)] px-4 pt-12 pb-20">
      <div className="max-w-3xl mx-auto text-neutral-700 space-y-10">
        <h1 className="text-3xl font-bold text-neutral-900 text-center">Privacy Policy</h1>
        <p className="text-sm text-neutral-400 text-center">Last updated: May 2026</p>

        <div className="space-y-8">

          <div>
            <h2 className="font-semibold text-lg text-neutral-900">What we collect</h2>
            <p>
              MoodHaven Journal is designed to collect as little as possible. The journal app
              itself stores all your entries locally on your device — nothing is sent to our servers.
              This website does not collect any personal information.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-lg text-neutral-900">Journal data</h2>
            <p>
              Your journal entries are encrypted on your device using AES-256-GCM before being
              stored. We have no access to your entries, your encryption key, or your password.
              When you use the web app at <a href="https://journal.moodhaven.app" className="text-primary-700 underline">journal.moodhaven.app</a>,
              your data is stored in your browser&apos;s IndexedDB — it never leaves your device.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-lg text-neutral-900">This website</h2>
            <p>
              moodhaven.app is hosted on Cloudflare Pages. Cloudflare may collect standard web
              analytics (page views, referrers, general geographic region) in aggregate form.
              We do not use cookies, ad trackers, or third-party analytics on this site.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-lg text-neutral-900">Third-party services</h2>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li><strong>Substack</strong> — newsletter and blog posts</li>
              <li><strong>Cloudflare</strong> — hosting and CDN</li>
            </ul>
            <p className="mt-2">Each service has its own privacy policy.</p>
          </div>

          <div>
            <h2 className="font-semibold text-lg text-neutral-900">Contact</h2>
            <p>
              Questions? Reach out via{' '}
              <a href="https://github.com/kenlacroix/moodhaven-journal" className="text-primary-700 underline" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>{' '}
              or the newsletter.
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
