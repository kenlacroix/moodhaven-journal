import Link from "next/link";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "Open Journal App", href: "https://journal.moodhaven.app", external: true },
      { label: "Download Desktop", href: "/download" },
      { label: "Platforms", href: "/platforms" },
      { label: "About", href: "/about" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "FAQ", href: "/faq" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
  {
    heading: "Community",
    links: [
      { label: "GitHub ↗", href: "https://github.com/kenlacroix/moodhaven-journal", external: true },
      { label: "Contribute", href: "/contribute" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
];

export default function FooterColumns() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10 text-left">
      {columns.map((col) => (
        <div key={col.heading}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
            {col.heading}
          </h3>
          <ul className="space-y-2">
            {col.links.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="text-sm text-neutral-600 hover:text-primary-700 transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
