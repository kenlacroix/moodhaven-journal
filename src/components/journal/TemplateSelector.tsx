/**
 * TemplateSelector - Choose a journal template to start writing
 *
 * Displays available templates as cards with descriptions.
 */

import { JOURNAL_TEMPLATES, type JournalTemplate } from '../../lib/utils/journalTemplates';

interface TemplateSelectorProps {
  onSelect: (template: JournalTemplate) => void;
  selectedId?: string;
  compact?: boolean;
  /** Template IDs used today — shows a ✓ Used badge */
  usedTemplateIds?: string[];
}

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-800',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-800',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800',
  },
  slate: {
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700',
  },
};

export function TemplateSelector({ onSelect, selectedId, compact = false, usedTemplateIds }: TemplateSelectorProps) {
  if (compact) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2">
        {JOURNAL_TEMPLATES.map((template) => {
          const colors = COLOR_CLASSES[template.color] || COLOR_CLASSES.slate;
          const isSelected = selectedId === template.id;
          const isUsed = usedTemplateIds?.includes(template.id);

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className={`
                relative flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all
                ${isSelected
                  ? `${colors.bg} ${colors.border} ring-2 ring-offset-2 ring-${template.color}-500`
                  : `bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:${colors.bg}`
                }
              `}
            >
              <span className="text-lg">{template.emoji}</span>
              <span className={`text-sm font-medium ${isSelected ? colors.text : 'text-slate-700 dark:text-slate-200'}`}>
                {template.name}
              </span>
              {isUsed && (
                <span className="absolute -top-1.5 -right-1.5 text-[9px] font-semibold bg-emerald-500 text-white px-1 py-0.5 rounded-full leading-none">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Choose a template
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {JOURNAL_TEMPLATES.map((template) => {
          const colors = COLOR_CLASSES[template.color] || COLOR_CLASSES.slate;
          const isSelected = selectedId === template.id;
          const isUsed = usedTemplateIds?.includes(template.id);

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className={`
                relative p-4 rounded-xl border text-left transition-all
                ${isSelected
                  ? `${colors.bg} ${colors.border} ring-2 ring-${template.color}-500`
                  : `bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:${colors.bg} hover:${colors.border}`
                }
              `}
            >
              <span className="text-2xl mb-2 block">{template.emoji}</span>
              <p className={`font-medium text-sm ${isSelected ? colors.text : 'text-slate-700 dark:text-slate-200'}`}>
                {template.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {template.description}
              </p>
              {isUsed && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                  ✓ Used
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
