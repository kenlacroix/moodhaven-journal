import React from 'react';

interface Props {
  onAccept: () => void;
}

export function WellnessDisclaimerScreen({ onAccept }: Props): React.JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
      <div className="max-w-md w-full flex flex-col gap-6 text-center">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">A note before you begin</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            MoodHaven Journal is a personal journaling and wellness tool. It is not a licensed mental health application and is not a substitute for professional mental health support.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            If you are in crisis or experiencing significant distress, please reach out to a qualified mental health professional or a crisis line in your area.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500 leading-relaxed">
            The app includes optional somatic wellness features. These are general self-care tools, not professional healthcare tools, and may not be appropriate for everyone.
          </p>
        </div>

        <button
          type="button"
          onClick={onAccept}
          className="w-full rounded-xl bg-violet-600 text-white py-3 text-sm font-semibold hover:bg-violet-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          I understand, continue
        </button>

        <p className="text-[11px] text-slate-400 dark:text-slate-600 leading-relaxed">
          Shown once. You can find wellness guidelines in Settings → About.
        </p>
      </div>
    </div>
  );
}
