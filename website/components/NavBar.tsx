// components/NavBar.tsx
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { name: 'Home', href: '/' },
  { name: 'Get Started', href: '/getting-started' },
  { name: 'Features', href: '/features' },
  { name: 'Download', href: '/download' },
  { name: 'Platforms', href: '/platforms' },
  { name: 'Blog', href: '/blog' },
  { name: 'About', href: '/about' },
  { name: 'FAQ', href: '/faq' },
];

export default function NavBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Homepage hero has a dark gradient — navbar can be transparent there.
  // All other pages have a white background, so default to solid white on load.
  const isHero = pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navBg = useMemo(() => {
    if (isHero) {
      return scrolled ? 'bg-white/90 backdrop-blur-md border-b border-neutral-200' : 'bg-transparent';
    }
    return 'bg-white/95 backdrop-blur-md border-b border-neutral-200';
  }, [isHero, scrolled]);

  return (
    <header
      role="banner"
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${navBg}`}
    >
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between"
      >
        {/* Logo */}
        <Link href="/" className="flex items-center h-12">
          <Image
            src="/logo-full.png"
            alt="MoodHaven Journal Logo"
            width={160}
            height={48}
            priority
            className="object-contain"
          />
        </Link>

        {/* Desktop Nav Links + CTA */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`relative text-sm font-medium transition-colors duration-200 group ${
                  isHero && !scrolled
                    ? active ? 'text-white' : 'text-primary-200 hover:text-white'
                    : active ? 'text-primary-700' : 'text-neutral-800 hover:text-primary-700'
                }`}
              >
                {link.name}
                <span
                  className={`absolute left-0 -bottom-0.5 h-[2px] w-full transition-transform duration-300 origin-left ${
                    isHero && !scrolled ? 'bg-white' : 'bg-primary-700'
                  } ${active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}
                />
              </Link>
            );
          })}
          <a
            href="https://journal.moodhaven.app"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-accent-cta text-neutral-900 px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-200 ease-out hover:bg-accent-cta/90 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60 whitespace-nowrap"
          >
            Try Free <span aria-hidden="true">→</span>
          </a>
        </div>

        {/* Mobile Toggle */}
        <button
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className={`md:hidden ${isHero && !scrolled ? 'text-white' : 'text-neutral-800'}`}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {/* Mobile Nav Drawer */}
      <div
        id="mobile-menu"
        role="menu"
        aria-label="Mobile navigation"
        className={`md:hidden fixed inset-y-0 right-0 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-40 flex flex-col ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <Link href="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2">
            <Image
              src="/logo-full.png"
              alt="MoodHaven Journal"
              width={120}
              height={36}
              className="object-contain"
            />
          </Link>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav links */}
        <div className="flex flex-col flex-1 px-4 py-4 gap-1 overflow-y-auto">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>

        {/* Drawer footer CTA */}
        <div className="px-4 py-5 border-t border-neutral-100">
          <a
            href="https://journal.moodhaven.app"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="block text-center rounded-full bg-accent-cta text-neutral-900 px-4 py-3 text-sm font-semibold shadow-sm hover:bg-accent-cta/90 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
          >
            Try Free <span aria-hidden="true">→</span>
          </a>
          <p className="text-center text-xs text-neutral-400 mt-3">No account required. Always free.</p>
        </div>
      </div>

      {/* Mobile backdrop */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 md:hidden"
        />
      )}
    </header>
  );
}
