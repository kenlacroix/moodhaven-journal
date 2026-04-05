// components/NavBar.tsx
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { name: 'Home', href: '/' },
  { name: 'Download', href: '/download' },
  { name: 'Blog', href: '/blog' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Contribute', href: '/contribute' },
];

export default function NavBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      role="banner"
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-md border-b border-neutral-200'
          : 'bg-transparent'
      }`}
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
                className={`relative text-sm font-medium transition-colors duration-200 ${
                  active ? 'text-primary-700' : 'text-neutral-800 hover:text-primary-700'
                } group`}
              >
                {link.name}
                <span
                  className={`absolute left-0 -bottom-0.5 h-[2px] w-full bg-primary-700 transition-transform duration-300 origin-left ${
                    active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                  }`}
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
          className="md:hidden text-neutral-800"
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
        className={`md:hidden fixed inset-y-0 right-0 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-40 ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col p-6 space-y-4">
          <a
            href="https://journal.moodhaven.app"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="block text-center rounded-full bg-accent-cta text-neutral-900 px-4 py-3 text-sm font-semibold shadow-sm hover:bg-accent-cta/90 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cta/60"
          >
            Try Free <span aria-hidden="true">→</span>
          </a>
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={`relative text-base font-medium transition-colors duration-200 ${
                  active ? 'text-primary-700' : 'text-neutral-800 hover:text-primary-700'
                } group`}
              >
                {link.name}
                <span
                  className={`absolute left-0 -bottom-0.5 h-[2px] w-full bg-primary-700 transition-transform duration-300 origin-left ${
                    active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                />
              </Link>
            );
          })}
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
