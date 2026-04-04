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
            The core journaling experience is free and always will be. A Pro tier for AI insights and future cloud
            features is planned — but local journaling, mood tracking, and all privacy features stay free.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-primary-700">🌱 What&apos;s the difference between Community and future versions?</h2>
          <p>
            The Community version is free, open-source, and entirely local. Future Pro features may include
            optional encrypted sync, advanced AI insights, and multi-device backup — but the core experience
            stays distraction-free and privacy-first.
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
    </div>
  );
}
