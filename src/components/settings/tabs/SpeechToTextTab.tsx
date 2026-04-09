import type { SettingsTabBaseProps } from './types';

type Props = Pick<SettingsTabBaseProps, 'settings' | 'updateSettings' | 'saveSettings'>;

export function SpeechToTextTab(_props: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Speech to Text
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Dictate journal entries using your microphone. All transcription happens on your device — no audio leaves your machine.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm text-slate-500 dark:text-slate-400">
        Speech to text model management coming in the next update.
      </div>
    </div>
  );
}
