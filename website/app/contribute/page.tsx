export default function ContributePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-gray-800 space-y-10">
      <h1 className="text-3xl font-bold text-blue-700 text-center">Contribute to MoodHaven</h1>

      <p className="text-lg text-center">
        MoodHaven is an open, community-built journaling tool focused on privacy and reflection. Whether you're a
        developer, designer, writer, or someone passionate about mindful tech — there's a place for you here.
      </p>

      <div className="space-y-6">
        <div>
          <h2 className="font-semibold text-lg text-blue-600">🧑‍💻 Developers</h2>
          <p>
            We welcome pull requests, bug reports, and feature ideas. Check out the open issues or start with a good-first-issue on 
            <a
              href="https://github.com/kenlacroix/moodhaven-journal"
              className="text-blue-600 underline ml-1"
              target="_blank"
            >
              GitHub
            </a>.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-blue-600">✍️ Writers & Testers</h2>
          <p>
            Help improve our documentation, test the app, or share feedback on your journaling experience. You don’t need to code to make a big impact.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg text-blue-600">📣 Advocates</h2>
          <p>
            If you believe in what we’re building, help spread the word. Share MoodHaven with people who value thoughtful tools and digital calm.
          </p>
        </div>
      </div>

      <div className="text-center pt-8">
        <a
          href="https://github.com/kenlacroix/moodhaven-journal"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-full hover:bg-blue-700 transition"
          target="_blank"
        >
          Visit the GitHub Repository →
        </a>
      </div>
    </div>
  );
}
