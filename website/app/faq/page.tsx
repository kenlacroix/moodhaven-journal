export default function FAQPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-gray-800 space-y-10">
      <h1 className="text-3xl font-bold text-primary-700 text-center">Frequently Asked Questions</h1>

      <div className="space-y-6">

        <div>
          <h2 className="font-semibold text-lg text-primary-700">🔒 How secure is my data?</h2>
          <p>
            All your data is stored locally on your device, encrypted with AES-256-GCM before it ever touches disk.
            Nothing is uploaded or shared. Your journal entries never leave your machine unless you choose to export them.
            The web app stores entries in your browser&apos;s IndexedDB — same encryption, no cloud.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">📤 Can I export my journal?</h2>
          <p>
            Yes — export shipped in v0.6.0. You can export your entries as an encrypted <code>.moodhaven</code> backup
            file or as a plaintext file. Find it under Settings &rarr; Data Management.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">📱 Will there be a mobile app?</h2>
          <p>
            The web app is available now at{' '}
            <a href="https://journal.moodhaven.app" className="text-primary-700 underline" target="_blank" rel="noopener noreferrer">
              journal.moodhaven.app
            </a>{' '}
            — it works on any device with a browser. A Wear OS companion for voice memos launched with v0.7.0,
            and LAN peer sync lets you keep multiple devices in sync without a cloud account.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">💰 Is MoodHaven free?</h2>
          <p>
            Yes — completely free, forever. MoodHaven is open source under the MIT license. There is no Pro tier,
            no subscription, and no paid features. Everything ships to everyone.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">🌱 Is this really open source?</h2>
          <p>
            Yes.{' '}
            <a href="https://github.com/kenlacroix/moodhaven-journal" className="text-primary-700 underline" target="_blank" rel="noopener noreferrer">
              Every line of code is on GitHub
            </a>
            , MIT licensed. You can build it yourself, fork it, audit it, or contribute to it.
            No closed core, no open-core bait-and-switch.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">🤝 How do I contribute?</h2>
          <p>
            We&apos;d love your help! You can{' '}
            <a href="https://github.com/kenlacroix/moodhaven-journal" className="text-primary-700 underline" target="_blank" rel="noopener noreferrer">
              visit our GitHub repo
            </a>
            , suggest features, report issues, or join the discussion on shaping the future of MoodHaven.
          </p>
        </div>

      </div>

      {/* Technical Details */}
      <section className="pt-4">
        <h2 className="font-semibold text-lg text-primary-700 mb-4">🔧 Technical Details</h2>
        <div className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200 overflow-hidden">

          <details className="group bg-white/90">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none text-sm font-medium text-neutral-900 hover:bg-primary-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none">
              What encryption does MoodHaven use?
              <span className="ml-2 text-neutral-400 group-open:rotate-180 transition-transform duration-200" aria-hidden="true">▾</span>
            </summary>
            <div className="px-5 pb-5 pt-2 text-sm text-neutral-600 leading-relaxed">
              AES-256-GCM with PBKDF2 key derivation (600,000 iterations). Each entry has its own
              random 16-byte salt — compromising one entry&apos;s key doesn&apos;t expose others.
              Keys are derived from your password in memory and never stored anywhere.
            </div>
          </details>

          <details className="group bg-white/90">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none text-sm font-medium text-neutral-900 hover:bg-primary-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none">
              Can I verify the source code?
              <span className="ml-2 text-neutral-400 group-open:rotate-180 transition-transform duration-200" aria-hidden="true">▾</span>
            </summary>
            <div className="px-5 pb-5 pt-2 text-sm text-neutral-600 leading-relaxed">
              Yes. MoodHaven is fully open source.{' '}
              <a
                href="https://github.com/kenlacroix/moodhaven-journal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-700 underline hover:text-primary-900"
              >
                View the repository on GitHub
              </a>
              . The security model is documented in{' '}
              <a
                href="https://github.com/kenlacroix/moodhaven-journal/blob/main/SECURITY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-700 underline hover:text-primary-900"
              >
                SECURITY.md
              </a>
              .
            </div>
          </details>

          <details className="group bg-white/90">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none text-sm font-medium text-neutral-900 hover:bg-primary-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none">
              How does AI work without sending my data?
              <span className="ml-2 text-neutral-400 group-open:rotate-180 transition-transform duration-200" aria-hidden="true">▾</span>
            </summary>
            <div className="px-5 pb-5 pt-2 text-sm text-neutral-600 leading-relaxed">
              AI features analyze anonymized metadata only: mood scores, sentiment categories,
              time-of-day patterns, and entry frequency. Your actual journal text is never sent
              to any external API. AI is opt-in and disabled by default.
            </div>
          </details>

          <details className="group bg-white/90">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none text-sm font-medium text-neutral-900 hover:bg-primary-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none">
              What is peer sync and how secure is it?
              <span className="ml-2 text-neutral-400 group-open:rotate-180 transition-transform duration-200" aria-hidden="true">▾</span>
            </summary>
            <div className="px-5 pb-5 pt-2 text-sm text-neutral-600 leading-relaxed">
              Peer sync connects your devices over your local network using an Ed25519 device
              identity and AES-256-GCM encrypted transport. No cloud intermediary. A passive
              observer on your network sees only ciphertext.{' '}
              <a
                href="https://github.com/kenlacroix/moodhaven-journal/blob/main/docs/architecture.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-700 underline hover:text-primary-900"
              >
                Architecture docs ↗
              </a>
            </div>
          </details>

          <details className="group bg-white/90">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none text-sm font-medium text-neutral-900 hover:bg-primary-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:outline-none">
              How do I install on Linux?
              <span className="ml-2 text-neutral-400 group-open:rotate-180 transition-transform duration-200" aria-hidden="true">▾</span>
            </summary>
            <div className="px-5 pb-5 pt-2 text-sm text-neutral-600 leading-relaxed">
              Download the <code className="bg-neutral-100 px-1 rounded text-xs">.AppImage</code> file
              from the{' '}
              <a href="/download" className="text-primary-700 underline hover:text-primary-900">
                Downloads page
              </a>
              . Make it executable (<code className="bg-neutral-100 px-1 rounded text-xs">chmod +x</code>)
              and run it directly — no installation required.
            </div>
          </details>

        </div>
      </section>

    </div>
  );
}
