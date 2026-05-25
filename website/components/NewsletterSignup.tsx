"use client";

import { useState, useRef } from "react";
import AnimatedReveal from "./AnimatedReveal";

export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    const url = `https://moodhaven.substack.com/subscribe?email=${encodeURIComponent(trimmed)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="bg-[var(--background)] px-4 py-12">
      <AnimatedReveal>
        <div className="max-w-xl mx-auto text-center">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
            Newsletter
          </p>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">
            Stay in the loop
          </h2>
          <p className="text-sm text-neutral-500 leading-relaxed mb-6 max-w-sm mx-auto">
            Writing about privacy-first software, local-first design, and what&apos;s coming next. New posts go to Substack first.
          </p>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-2 max-w-sm mx-auto"
            noValidate
          >
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              ref={inputRef}
              id="newsletter-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              required
              className="flex-1 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
            <button
              type="submit"
              className="rounded-full bg-primary-700 text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary-800 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60 whitespace-nowrap"
            >
              Subscribe
            </button>
          </form>

          <p className="text-xs text-neutral-400 mt-3">
            Delivered via{" "}
            <a
              href="https://moodhaven.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-neutral-600"
            >
              Substack
            </a>
            . No spam. Unsubscribe any time.
          </p>
        </div>
      </AnimatedReveal>
    </section>
  );
}
