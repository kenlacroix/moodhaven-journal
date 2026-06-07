'use client';
import AnimatedReveal from './AnimatedReveal';
import { Layers, Lock, Zap } from 'lucide-react';

const CARDS = [
  {
    icon: Layers,
    title: 'The Problem',
    body: "Every journaling app I tried either required a subscription, stored my private thoughts in someone else's cloud, or felt designed to sell me ads based on my emotional state. I wanted something that felt like a private notebook — not a SaaS product.",
    accent: 'bg-primary-50 text-primary-700',
  },
  {
    icon: Lock,
    title: 'The Tech Decisions',
    body: 'Tauri + Rust for native performance without Electron weight. AES-256-GCM encryption before data ever touches SQLite — the Rust layer never sees plaintext. React + TypeScript strict. No cloud dependencies; peer sync over LAN via Ed25519 key exchange.',
    accent: 'bg-violet-50 text-violet-700',
  },
  {
    icon: Zap,
    title: 'The Hardest Part',
    body: 'Encryption UX without a cloud recovery path. When your password IS the key, "forgot password" means data loss. Designing a recovery flow that is honest about this tradeoff — without scaring away users — took three full redesigns.',
    accent: 'bg-orange-50 text-orange-700',
  },
];

export default function HowIBuiltThis() {
  return (
    <section className="py-16 md:py-20 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <AnimatedReveal>
          <div className="text-center mb-12">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-3 block">
              Builder Notes
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 tracking-tight">
              How I Built This
            </h2>
            <p className="text-neutral-500 mt-3 max-w-xl mx-auto text-sm">
              Decisions, tradeoffs, and hard lessons from 7 months building a privacy-first desktop app solo.{' '}
              <a href="/blog" className="text-primary-700 hover:underline font-medium">
                Read the full post →
              </a>
            </p>
          </div>
        </AnimatedReveal>
        <div className="grid md:grid-cols-3 gap-6">
          {CARDS.map((card, i) => (
            <AnimatedReveal key={card.title} delay={i * 0.1}>
              <div className="bg-[#F8F6F2] rounded-xl p-6 h-full flex flex-col gap-4 ring-1 ring-neutral-100">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.accent}`}>
                  <card.icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-neutral-900 text-base">{card.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed flex-1">{card.body}</p>
              </div>
            </AnimatedReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
