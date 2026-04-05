// components/Footer.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaGithub,
  FaTwitter,
  FaLinkedin,
  FaRss,
  FaChevronUp,
} from "react-icons/fa";
import { SiBluesky } from "react-icons/si";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedReveal from "./AnimatedReveal";
import FooterColumns from "./FooterColumns";

export default function Footer() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const currentYear = new Date().getFullYear();

  return (
    <motion.footer
      role="contentinfo"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative w-full bg-[var(--background)] border-t border-neutral-200 pt-10 pb-14 text-[var(--foreground)]"
    >
      <div className="max-w-4xl mx-auto px-6">
        {/* Three-column link grid */}
        <AnimatedReveal>
          <FooterColumns />
        </AnimatedReveal>

        <hr className="border-neutral-200 mb-6" />

        {/* Social Icons */}
        <nav
          role="navigation"
          aria-label="Social media links"
          className="flex justify-center items-center flex-wrap gap-5 mb-6"
        >
          {[
            { href: "https://moodhaven.substack.com", icon: <FaRss />, title: "Substack" },
            { href: "https://github.com/kenlacroix/moodhaven-journal", icon: <FaGithub />, title: "GitHub" },
            { href: "https://x.com/moodhavenapp", icon: <FaTwitter />, title: "X (Twitter)" },
            { href: "https://bsky.app/profile/moodhavenapp.bsky.social", icon: <SiBluesky />, title: "Bluesky" },
            { href: "https://www.linkedin.com/company/moodhavenapp/", icon: <FaLinkedin />, title: "LinkedIn" },
          ].map((item, index) => (
            <AnimatedReveal key={item.title} delay={index * 0.1}>
              <SocialIcon href={item.href} title={item.title}>
                {item.icon}
              </SocialIcon>
            </AnimatedReveal>
          ))}
        </nav>

        {/* Copyright */}
        <AnimatedReveal delay={0.4}>
          <small className="block text-xs text-neutral-400 text-center tracking-wide">
            © {currentYear} MoodHaven Journal. Open source, privacy-first journaling.{" "}
            Built by{" "}
            <Link
              href="https://www.kennethlacroix.me"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-neutral-600"
            >
              Ken LaCroix
            </Link>
            {" "}· MIT License
          </small>
        </AnimatedReveal>
      </div>

      {/* Scroll to Top */}
      <AnimatePresence>
        {showTop && (
          <motion.button
            onClick={() =>
              window.scrollTo({ top: 0, behavior: "smooth" })
            }
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            title="Back to top"
            className="fixed bottom-[5.5rem] sm:bottom-6 right-4 sm:right-6 w-11 h-11 rounded-full bg-white border border-neutral-300 text-primary-700 shadow-md hover:bg-primary-50 transition-transform hover:scale-105 z-50 flex items-center justify-center"
            aria-label="Scroll to top"
          >
            <FaChevronUp size={16} aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.footer>
  );
}

function SocialIcon({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-neutral-200 shadow-sm text-[var(--foreground)] hover:text-primary-700 hover:bg-primary-50 transition-transform transform hover:scale-110 duration-200"
    >
      <span className="sr-only">{title}</span>
      {children}
    </Link>
  );
}
