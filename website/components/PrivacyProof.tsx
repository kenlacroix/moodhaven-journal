// components/PrivacyProof.tsx
import AnimatedReveal from "./AnimatedReveal";

const NEVER_COLLECTED = [
  "Journal text",
  "Passwords or keys",
  "Usage analytics",
  "IP addresses",
  "Location (beyond opt-in weather)",
  "Device identifiers",
];

const SPECS = [
  {
    label: "Cipher",
    value: "AES-256-GCM",
    note: "authenticated encryption, tamper-evident",
  },
  {
    label: "Key derivation",
    value: "PBKDF2-HMAC-SHA256",
    note: "600,000 iterations — on par with 1Password and Bitwarden",
  },
  {
    label: "Salt",
    value: "16 bytes, per-entry random",
    note: "compromising one key exposes exactly one entry",
  },
  {
    label: "Key storage",
    value: "None",
    note: "derived in memory, cleared on lock or exit",
  },
  {
    label: "Network calls on save",
    value: "Zero",
    note: "SQLite write path is entirely local — audit create_journal_entry in journal.rs",
  },
  {
    label: "Source available",
    value: "MIT licensed",
    note: "every line of the encryption path is public and auditable",
  },
];

export default function PrivacyProof() {
  return (
    <section className="bg-[var(--background)] px-4 py-20">
      <div className="max-w-5xl mx-auto">
        <AnimatedReveal>
          <p className="text-center text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            Privacy, proved
          </p>
          <h2 className="text-center text-2xl md:text-3xl font-bold text-neutral-900 mb-10">
            Zero data collected. Verified in code.
          </h2>
        </AnimatedReveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Never collected */}
          <AnimatedReveal delay={0.1}>
            <div className="bg-white/90 rounded-xl p-6 ring-1 ring-neutral-100 h-full">
              <h3 className="text-base font-semibold text-neutral-900 mb-1">
                What we never collect
              </h3>
              <p className="text-xs text-neutral-400 mb-5">
                Not stored. Not transmitted. Not possible by design.
              </p>
              <ul className="space-y-2.5">
                {NEVER_COLLECTED.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-neutral-700">
                    <span
                      className="flex-shrink-0 w-4 h-4 rounded-full bg-red-50 flex items-center justify-center text-[10px] text-red-500 font-bold"
                      aria-hidden="true"
                    >
                      ✕
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </AnimatedReveal>

          {/* Technical spec */}
          <AnimatedReveal delay={0.2}>
            <div className="bg-white/90 rounded-xl p-6 ring-1 ring-neutral-100 h-full">
              <h3 className="text-base font-semibold text-neutral-900 mb-1">
                Encryption spec
              </h3>
              <p className="text-xs text-neutral-400 mb-5">
                Verify it in{" "}
                <a
                  href="https://github.com/kenlacroix/moodhaven-journal/blob/main/src/lib/services/crypto.ts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700 rounded"
                >
                  crypto.ts
                </a>{" "}
                and{" "}
                <a
                  href="https://github.com/kenlacroix/moodhaven-journal/blob/main/src-tauri/src/commands/journal.rs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700 rounded"
                >
                  journal.rs
                </a>
                .
              </p>
              <dl className="space-y-3">
                {SPECS.map((spec) => (
                  <div key={spec.label} className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                    <dt className="text-neutral-400 font-medium pt-0.5 truncate">{spec.label}</dt>
                    <dd>
                      <span className="font-mono text-xs bg-primary-50 text-primary-800 px-1.5 py-0.5 rounded">
                        {spec.value}
                      </span>
                      <span className="block text-xs text-neutral-500 mt-0.5">{spec.note}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </AnimatedReveal>
        </div>
      </div>
    </section>
  );
}
