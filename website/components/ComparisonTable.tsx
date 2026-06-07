import AnimatedReveal from "./AnimatedReveal";

const ROWS = [
  {
    feature: "Requires a cloud account",
    moodhaven: { value: "No — local only", positive: true },
    cloud: { value: "Yes — Google/Dropbox/iCloud required", positive: false },
  },
  {
    feature: "Open source & auditable",
    moodhaven: { value: "MIT licensed", positive: true },
    cloud: { value: "Rarely", positive: false },
  },
  {
    feature: "Peer sync without relay",
    moodhaven: { value: "Yes — LAN direct", positive: true },
    cloud: { value: "No — cloud relay only", positive: false },
  },
  {
    feature: "Works fully offline",
    moodhaven: { value: "Yes", positive: true },
    cloud: { value: "Sometimes", positive: false },
  },
  {
    feature: "End-to-end encryption",
    moodhaven: { value: "Yes — keys in memory, never stored", positive: true },
    cloud: { value: "Varies", positive: false },
  },
  {
    feature: "Zero telemetry",
    moodhaven: { value: "Yes", positive: true },
    cloud: { value: "Often collects usage data", positive: false },
  },
  {
    feature: "Paid tier for AI features",
    moodhaven: { value: "Never — always free", positive: true },
    cloud: { value: "Usually $10–20/year", positive: false },
  },
];

export default function ComparisonTable() {
  return (
    <section className="bg-[var(--background)] px-4 py-20">
      <div className="max-w-5xl mx-auto">
        <AnimatedReveal>
          <p className="text-center text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            How we compare
          </p>
          <h2 className="text-center text-2xl md:text-3xl font-bold text-neutral-900 mb-12">
            MoodHaven vs cloud-based journals
          </h2>
        </AnimatedReveal>
        <AnimatedReveal delay={0.1}>
          <div className="bg-white/90 rounded-xl ring-1 ring-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="text-left px-5 py-3.5 font-semibold text-neutral-500 w-1/2">Feature</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-primary-700">MoodHaven</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-neutral-500">Cloud journals</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={i % 2 === 0 ? "bg-neutral-50/50" : "bg-white"}
                    >
                      <td className="px-5 py-3.5 text-neutral-700 font-medium">{row.feature}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                          <span className="text-emerald-500" aria-hidden="true">✓</span>
                          {row.moodhaven.value}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-neutral-500">
                          <span className="text-neutral-400" aria-hidden="true">✗</span>
                          {row.cloud.value}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </AnimatedReveal>
      </div>
    </section>
  );
}
