import type { ExportFilter } from '../../../lib/services/dataManagementService';
import { SelectiveExportPanel } from '../SelectiveExportPanel';

interface ExportTabProps {
  exportMatchCount: number | null;
  exportTags: string[];
  handleSelectiveExport: (filter: ExportFilter) => void;
  isExporting: boolean;
}

export function ExportTab({
  exportMatchCount,
  exportTags,
  handleSelectiveExport,
  isExporting,
}: ExportTabProps) {
  return (
    <div id="panel-export" role="tabpanel" className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Selective Export
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Export a filtered subset of your journal. Leave all filters blank to export everything.
          Exports entries only (no media attachments).
        </p>
        <SelectiveExportPanel
          availableTags={exportTags}
          matchCount={exportMatchCount}
          onExport={handleSelectiveExport}
          isExporting={isExporting}
        />
      </div>
    </div>
  );
}
