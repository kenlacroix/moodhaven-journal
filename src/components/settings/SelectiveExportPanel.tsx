/**
 * SelectiveExportPanel
 *
 * Provides optional filters (tags, mood range, date range) for journal export.
 * Calls the parent-provided onExport with the assembled ExportFilter.
 */

import { useState } from 'react';
import type { ExportFilter } from '../../lib/services/dataManagementService';

interface SelectiveExportPanelProps {
  /** All tags available in the journal (for the tag picker). */
  availableTags: string[];
  /** Preview count of entries matching the current filters (null = loading). */
  matchCount: number | null;
  /** Triggered when the user confirms export. */
  onExport: (filter: ExportFilter) => void;
  isExporting?: boolean;
}

export function SelectiveExportPanel({
  availableTags,
  matchCount,
  onExport,
  isExporting = false,
}: SelectiveExportPanelProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [moodMin, setMoodMin] = useState<number>(1);
  const [moodMax, setMoodMax] = useState<number>(5);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const hasFilters =
    selectedTags.length > 0 ||
    moodMin > 1 ||
    moodMax < 5 ||
    startDate !== '' ||
    endDate !== '';

  function buildFilter(): ExportFilter {
    const f: ExportFilter = {};
    if (selectedTags.length > 0) f.tags = selectedTags;
    if (moodMin > 1) f.moodMin = moodMin;
    if (moodMax < 5) f.moodMax = moodMax;
    if (startDate) f.startDate = startDate;
    if (endDate) f.endDate = endDate;
    return f;
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  const exportDisabled = isExporting || matchCount === 0;

  return (
    <div className="space-y-5">
      {/* Tags */}
      {availableTags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            Filter by tags
          </p>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-violet-500 text-white border-violet-500'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-violet-400'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mood range */}
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
          Mood range: {moodMin}–{moodMax}
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={5}
            value={moodMin}
            aria-label="Minimum mood"
            onChange={(e) => setMoodMin(Math.min(Number(e.target.value), moodMax))}
            className="flex-1 accent-violet-500"
          />
          <input
            type="range"
            min={1}
            max={5}
            value={moodMax}
            aria-label="Maximum mood"
            onChange={(e) => setMoodMax(Math.max(Number(e.target.value), moodMin))}
            className="flex-1 accent-violet-500"
          />
        </div>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
      </div>

      {/* Preview count + export button */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {matchCount === null ? (
            <span className="italic">Calculating…</span>
          ) : matchCount === 0 ? (
            <span className="text-rose-500 dark:text-rose-400">No entries match your filters</span>
          ) : (
            <span>
              Exporting <strong>{matchCount}</strong> {matchCount === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </p>

        <button
          type="button"
          disabled={exportDisabled}
          onClick={() => onExport(hasFilters ? buildFilter() : {})}
          className="px-4 py-2 text-sm font-semibold rounded-xl bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </div>
  );
}
