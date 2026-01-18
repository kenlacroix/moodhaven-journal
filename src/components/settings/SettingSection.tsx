/**
 * SettingSection - Reusable section wrapper for settings groups
 */

interface SettingSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingSection({ title, description, children }: SettingSectionProps) {
  return (
    <section className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
