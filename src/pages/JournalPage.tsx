/**
 * JournalPage - Main journal view combining editor and entry list
 *
 * Layout: Split view on desktop, stacked on mobile
 * - Left/Top: New entry editor with AI prompts
 * - Right/Bottom: Entry history and insights
 */

import { useState, useCallback } from 'react';
import { JournalEditor } from '../components/journal/JournalEditor';
import { EntryList } from '../components/journal/EntryList';
import { PromptSuggestions, InsightsPanel } from '../components/ai';
import { useJournal } from '../hooks/useJournal';
import { useAIInsights } from '../hooks/useAIInsights';
import type { JournalEntry, JournalEntryFormData } from '../types/journal';
import type { AIPrompt } from '../types/ai';

export function JournalPage() {
  const { entries, isLoading, addEntry, removeEntry } = useJournal();
  const {
    prompts,
    insights,
    patterns,
    isLoading: isAILoading,
    isAIEnabled,
    refreshPrompts,
    refreshInsights,
    dismissPrompt,
    dismissInsight,
  } = useAIInsights();

  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [editorInitialContent, setEditorInitialContent] = useState('');

  const handleSave = useCallback(
    async (data: JournalEntryFormData) => {
      await addEntry(data);
      setEditorInitialContent(''); // Clear prompt-based content after save
    },
    [addEntry]
  );

  const handleEntryClick = useCallback((entry: JournalEntry) => {
    setSelectedEntry(entry);
  }, []);

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      if (window.confirm('Are you sure you want to delete this entry?')) {
        await removeEntry(id);
        if (selectedEntry?.id === id) {
          setSelectedEntry(null);
        }
      }
    },
    [removeEntry, selectedEntry]
  );

  const handleUsePrompt = useCallback((prompt: AIPrompt) => {
    // Set the prompt text as the initial content for the editor
    setEditorInitialContent(`${prompt.text}\n\n`);
    // Scroll to editor
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="space-y-8">
      {/* AI Prompts Section */}
      <PromptSuggestions
        prompts={prompts}
        isLoading={isAILoading}
        isAIEnabled={isAIEnabled}
        onUsePrompt={handleUsePrompt}
        onDismissPrompt={dismissPrompt}
        onRefresh={refreshPrompts}
      />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Editor Section */}
        <section>
          <JournalEditor
            onSave={handleSave}
            initialContent={editorInitialContent}
          />
        </section>

        {/* History Section */}
        <section className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                Recent Entries
              </h2>

              {entries.length > 0 && (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </div>

            <EntryList
              entries={entries}
              onEntryClick={handleEntryClick}
              onDeleteEntry={handleDeleteEntry}
              isLoading={isLoading}
            />
          </div>

          {/* Insights Panel (shown after entries) */}
          {entries.length > 0 && (
            <InsightsPanel
              insights={insights}
              patterns={patterns}
              isLoading={isAILoading}
              isAIEnabled={isAIEnabled}
              onDismissInsight={dismissInsight}
              onRefresh={refreshInsights}
            />
          )}
        </section>
      </div>
    </div>
  );
}
