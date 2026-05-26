import React from 'react';

interface Props {
  onBegin: () => void;
}

export function WelcomeCard({ onBegin }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 max-w-sm mx-auto text-center px-2">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-800">When your body won&apos;t settle</h2>
        <p className="text-sm text-neutral-500 leading-relaxed">
          StillHaven plays alternating left-right tones — the same kind of bilateral rhythm
          your brain uses during deep sleep to process the day. Many people notice a shift
          in 5–10 minutes.
        </p>
      </div>

      <div className="flex flex-col gap-2 text-left">
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide text-center">When does this help?</p>
        <ul className="flex flex-col gap-1.5">
          {[
            'After a stressful conversation or unexpected news',
            'When you feel anxious but can\'t point to why',
            'When your mind keeps replaying something',
            'When your body feels tense even though you want to relax',
            'Before sleep when you\'re tired but still wound up',
          ].map((item) => (
            <li key={item} className="flex gap-2.5 items-start">
              <span className="mt-1 w-1.5 h-1.5 flex-shrink-0 rounded-full bg-[#F28C38]/60" />
              <span className="text-xs text-neutral-500 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3 text-left">
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide text-center">How it works</p>
        {[
          ['Choose a session type', 'Everyday Settling for general stress and mental noise; Heightened State for when your body is in alert mode.'],
          ['Rate how wound up you feel', 'A quick 1–10 check-in before and after so you can notice any shift.'],
          ['Let it run', 'Sit comfortably with headphones if possible. You don\'t need to do anything — just let the sounds move your attention.'],
        ].map(([title, body]) => (
          <div key={title} className="flex gap-3 items-start">
            <span className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full bg-[#F28C38]/15 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F28C38]" />
            </span>
            <div>
              <p className="text-xs font-semibold text-neutral-700">{title}</p>
              <p className="text-xs text-neutral-500 leading-relaxed mt-0.5">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-neutral-400 leading-relaxed border border-neutral-100 rounded-lg px-3 py-2.5 bg-neutral-50">
        StillHaven is a wellness tool, not a medical device. It is not a substitute
        for professional mental health support. If you are working through something
        difficult, please reach out to a qualified professional.
      </p>

      <button
        type="button"
        onClick={onBegin}
        className="px-8 py-3 rounded-full bg-[#F28C38] text-white text-sm font-semibold shadow hover:bg-[#e07c28] transition-colors"
      >
        Got it, let&apos;s begin
      </button>
    </div>
  );
}
