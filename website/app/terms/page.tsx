import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Terms of use for MoodHaven Journal — a free, open-source journaling app.',
  alternates: { canonical: 'https://www.moodhaven.app/terms' },
  robots: { index: true, follow: false },
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-neutral-700 space-y-10">
      <h1 className="text-3xl font-bold text-primary-700 text-center">Terms of Use</h1>
      <p className="text-sm text-neutral-400 text-center">Last updated: April 2026</p>

      <div className="space-y-8">

        <div>
          <h2 className="font-semibold text-lg text-primary-700">Use of the app</h2>
          <p>
            MoodHaven Journal (web app at <a href="https://journal.moodhaven.app" className="text-primary-700 underline">journal.moodhaven.app</a> and
            future desktop releases) is provided as-is. You may use it for personal journaling
            and mood tracking. You may not use it for any unlawful purpose or in a way that
            could harm others.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">Your data</h2>
          <p>
            Your journal entries belong to you. Because all data is stored locally and encrypted
            on your device, we cannot access, recover, or delete it on your behalf. You are
            responsible for keeping your password and any recovery key safe.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">No warranty</h2>
          <p>
            MoodHaven Journal is provided without warranty of any kind. We make no guarantees
            about uptime, data integrity, or fitness for a particular purpose. Always keep
            your own backups of important data.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">Open source</h2>
          <p>
            The source code is available on{' '}
            <a href="https://github.com/kenlacroix/moodhaven-journal" className="text-primary-700 underline" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>. Use and contributions are subject to the project license.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">Changes</h2>
          <p>
            These terms may be updated occasionally. Continued use of the app after changes
            are posted constitutes acceptance of the new terms.
          </p>
        </div>

      </div>
    </div>
  );
}
