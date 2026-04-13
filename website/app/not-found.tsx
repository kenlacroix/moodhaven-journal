// app/not-found.tsx
import Link from 'next/link';

export const metadata = {
  title: 'Page not found — MoodHaven Journal',
};

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="bg-[var(--background)] px-4 py-24 flex flex-col items-center text-center"
    >
      <p className="text-6xl font-bold text-primary-200 mb-2 select-none" aria-hidden="true">
        404
      </p>
      <h1 className="text-2xl font-bold text-neutral-900 mb-3">
        Page not found
      </h1>
      <p className="text-sm text-neutral-500 max-w-xs mb-10 leading-relaxed">
        That URL doesn&apos;t exist. The page may have moved, or you followed a
        stale link.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-primary-700 text-white px-6 py-3 text-sm font-semibold shadow hover:bg-primary-800 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60"
        >
          Go home
        </Link>
        <Link
          href="/download"
          className="rounded-full bg-white text-primary-700 px-6 py-3 text-sm font-semibold shadow border border-neutral-200 hover:bg-primary-50 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60"
        >
          Download the app
        </Link>
        <a
          href="https://journal.moodhaven.app"
          className="rounded-full bg-white text-neutral-700 px-6 py-3 text-sm font-semibold shadow border border-neutral-200 hover:bg-neutral-50 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60"
        >
          Open web app
        </a>
      </div>

      <p className="mt-12 text-xs text-neutral-400">
        Something broken?{' '}
        <a
          href="https://github.com/kenlacroix/moodhaven-journal/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-600"
        >
          File an issue on GitHub
        </a>
      </p>
    </main>
  );
}
