vi.mock('../lib/services/journalService', () => ({ getAllEntries: vi.fn() }));
vi.mock('../lib/utils/metadataExtractor', () => ({
  aggregateMetadata: vi.fn().mockReturnValue({}),
}));
vi.mock('../lib/services/aiService', () => ({
  generatePrompts: vi.fn(),
  getFallbackPrompts: vi.fn((n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `fp${i}`,
      text: 'prompt',
      category: 'reflection',
      reasoning: '',
      relevance: 0.5,
    })),
  ),
  buildHealthContextPrompts: vi.fn().mockReturnValue([]),
  detectRecurringPatterns: vi.fn().mockReturnValue([]),
  createAIServiceConfig: vi.fn().mockReturnValue({}),
}));
vi.mock('../lib/services/ouraService', () => ({ getHistory: vi.fn() }));
vi.mock('./useOuraContext', () => ({ buildMergedContext: vi.fn().mockReturnValue(null) }));

import { renderHook, waitFor } from '@testing-library/react';
import { useJournalPrompts } from './useJournalPrompts';
import { useSettingsStore } from '../stores/settingsStore';
import { getAllEntries } from '../lib/services/journalService';
import {
  generatePrompts,
  getFallbackPrompts,
  buildHealthContextPrompts,
  detectRecurringPatterns,
} from '../lib/services/aiService';
import { getHistory } from '../lib/services/ouraService';
import { buildMergedContext } from './useOuraContext';
import { createDefaultSettings } from '../types/settings';

const mockGetAllEntries = vi.mocked(getAllEntries);
const mockGeneratePrompts = vi.mocked(generatePrompts);
const mockGetFallbackPrompts = vi.mocked(getFallbackPrompts);
const mockBuildHealthContextPrompts = vi.mocked(buildHealthContextPrompts);
const mockDetectRecurringPatterns = vi.mocked(detectRecurringPatterns);
const mockGetHistory = vi.mocked(getHistory);
const mockBuildMergedContext = vi.mocked(buildMergedContext);

function makePrompts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    text: `prompt ${i}`,
    category: 'reflection' as const,
    reasoning: '',
    relevance: 0.8,
  }));
}

function setBaseSettings(overrides: Record<string, unknown> = {}) {
  const base = createDefaultSettings();
  useSettingsStore.setState({
    settings: {
      ...base,
      journal: { ...base.journal, showPrompts: true },
      ai: { ...base.ai, enabled: false },
      oura: { ...base.oura, enabled: false, enrichPrompts: false },
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllEntries.mockResolvedValue([]);
  mockDetectRecurringPatterns.mockReturnValue([]);
  mockBuildMergedContext.mockReturnValue(null);
  mockBuildHealthContextPrompts.mockReturnValue([]);
  setBaseSettings();
});

describe('useJournalPrompts', () => {
  describe('early-exit conditions', () => {
    it('returns empty arrays and isLoading=false when isNewEntry=false', () => {
      const { result } = renderHook(() => useJournalPrompts(false));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.forYouPrompts).toHaveLength(0);
      expect(result.current.generalPrompts).toHaveLength(0);
      expect(result.current.healthPrompts).toHaveLength(0);
      expect(mockGetAllEntries).not.toHaveBeenCalled();
    });

    it('returns empty arrays and isLoading=false when showPrompts=false', () => {
      const base = createDefaultSettings();
      useSettingsStore.setState({
        settings: {
          ...base,
          journal: { ...base.journal, showPrompts: false },
        },
      });
      const { result } = renderHook(() => useJournalPrompts(true));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.forYouPrompts).toHaveLength(0);
      expect(result.current.generalPrompts).toHaveLength(0);
      expect(mockGetAllEntries).not.toHaveBeenCalled();
    });
  });

  describe('successful load — base case (AI and Oura disabled)', () => {
    it('sets generalPrompts to fallback(6) after load', async () => {
      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockGetFallbackPrompts).toHaveBeenCalledWith(6);
      expect(result.current.generalPrompts).toHaveLength(6);
    });

    it('sets forYouPrompts to fallback(4) when AI is disabled', async () => {
      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockGetFallbackPrompts).toHaveBeenCalledWith(4);
      expect(result.current.forYouPrompts).toHaveLength(4);
    });

    it('sets hasNewPrompts=true after successful load', async () => {
      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.hasNewPrompts).toBe(true);
    });

    it('transitions isLoading from true to false', async () => {
      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it('healthPrompts stays empty when Oura is disabled', async () => {
      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.healthPrompts).toHaveLength(0);
      expect(mockGetHistory).not.toHaveBeenCalled();
    });
  });

  describe('AI-enabled paths', () => {
    function enableAI() {
      const base = createDefaultSettings();
      useSettingsStore.setState({
        settings: {
          ...base,
          journal: { ...base.journal, showPrompts: true },
          ai: {
            ...base.ai,
            enabled: true,
            features: { ...base.ai.features, contextualPrompts: true },
          },
          oura: { ...base.oura, enabled: false },
        },
      });
    }

    it('uses generatePrompts result when AI enabled + contextualPrompts=true + success', async () => {
      enableAI();
      const aiPrompts = makePrompts(4);
      mockGeneratePrompts.mockResolvedValue({ success: true, data: aiPrompts });

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGeneratePrompts).toHaveBeenCalled();
      expect(result.current.forYouPrompts).toEqual(aiPrompts);
    });

    it('falls back to fallback(4) when generatePrompts returns empty data', async () => {
      enableAI();
      mockGeneratePrompts.mockResolvedValue({ success: true, data: [] });

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGetFallbackPrompts).toHaveBeenCalledWith(4);
      expect(result.current.forYouPrompts).toHaveLength(4);
    });

    it('falls back to fallback(4) when generatePrompts returns success=false', async () => {
      enableAI();
      mockGeneratePrompts.mockResolvedValue({ success: false, error: 'API error' });

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGetFallbackPrompts).toHaveBeenCalledWith(4);
      expect(result.current.forYouPrompts).toHaveLength(4);
    });

    it('falls back to fallback(4) when contextualPrompts=false even if AI enabled', async () => {
      const base = createDefaultSettings();
      useSettingsStore.setState({
        settings: {
          ...base,
          journal: { ...base.journal, showPrompts: true },
          ai: {
            ...base.ai,
            enabled: true,
            features: { ...base.ai.features, contextualPrompts: false },
          },
          oura: { ...base.oura, enabled: false },
        },
      });

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGeneratePrompts).not.toHaveBeenCalled();
      expect(result.current.forYouPrompts).toHaveLength(4);
    });
  });

  describe('Oura health prompts', () => {
    function enableOura() {
      const base = createDefaultSettings();
      useSettingsStore.setState({
        settings: {
          ...base,
          journal: { ...base.journal, showPrompts: true },
          ai: { ...base.ai, enabled: false },
          oura: { ...base.oura, enabled: true, enrichPrompts: true },
        },
      });
    }

    it('sets healthPrompts when Oura enabled + enrichPrompts + context available', async () => {
      enableOura();
      const fakeHistory = [{ date: '2026-05-30' }] as Parameters<typeof buildMergedContext>[0];
      mockGetHistory.mockResolvedValue(fakeHistory);
      const mergedContext = { sleepScore: 80 } as ReturnType<typeof buildMergedContext>;
      mockBuildMergedContext.mockReturnValue(mergedContext);
      const healthPrompts = makePrompts(2);
      mockBuildHealthContextPrompts.mockReturnValue(healthPrompts);

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGetHistory).toHaveBeenCalledWith(7);
      expect(mockBuildHealthContextPrompts).toHaveBeenCalledWith(mergedContext, fakeHistory.length);
      expect(result.current.healthPrompts).toEqual(healthPrompts);
    });

    it('leaves healthPrompts empty when buildMergedContext returns null', async () => {
      enableOura();
      mockGetHistory.mockResolvedValue([]);
      mockBuildMergedContext.mockReturnValue(null);

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.healthPrompts).toHaveLength(0);
    });

    it('swallows getHistory errors — healthPrompts stays empty, load succeeds', async () => {
      enableOura();
      mockGetHistory.mockRejectedValue(new Error('network failure'));

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.healthPrompts).toHaveLength(0);
      // Main load still completed successfully
      expect(result.current.hasNewPrompts).toBe(true);
      expect(result.current.generalPrompts).toHaveLength(6);
    });

    it('does not call getHistory when oura.enabled=false', async () => {
      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockGetHistory).not.toHaveBeenCalled();
    });

    it('does not call getHistory when enrichPrompts=false', async () => {
      const base = createDefaultSettings();
      useSettingsStore.setState({
        settings: {
          ...base,
          journal: { ...base.journal, showPrompts: true },
          oura: { ...base.oura, enabled: true, enrichPrompts: false },
        },
      });

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockGetHistory).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('sets forYouPrompts=fallback(4) and generalPrompts=fallback(6) when getAllEntries throws', async () => {
      mockGetAllEntries.mockRejectedValue(new Error('db error'));

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGetFallbackPrompts).toHaveBeenCalledWith(4);
      expect(mockGetFallbackPrompts).toHaveBeenCalledWith(6);
      expect(result.current.forYouPrompts).toHaveLength(4);
      expect(result.current.generalPrompts).toHaveLength(6);
    });

    it('sets isLoading=false in finally even when load throws', async () => {
      mockGetAllEntries.mockRejectedValue(new Error('crash'));

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it('does not set hasNewPrompts=true when main try block throws', async () => {
      mockGetAllEntries.mockRejectedValue(new Error('crash'));

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasNewPrompts).toBe(false);
    });
  });

  describe('nudge derivation', () => {
    it('sets nudge from the highest-confidence positive_habit pattern', async () => {
      mockDetectRecurringPatterns.mockReturnValue([
        { id: '1', type: 'trigger', description: 'trigger nudge', confidence: 0.9, frequency: 'weekly' },
        { id: '2', type: 'positive_habit', description: 'morning pages', confidence: 0.8, frequency: 'daily' },
        { id: '3', type: 'positive_habit', description: 'evening walk', confidence: 0.6, frequency: 'daily' },
      ]);

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.nudge).toBe('morning pages');
    });

    it('sets nudge from weekly_pattern type as well', async () => {
      mockDetectRecurringPatterns.mockReturnValue([
        { id: '1', type: 'weekly_pattern', description: 'productive Mondays', confidence: 0.75, frequency: 'weekly' },
      ]);

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.nudge).toBe('productive Mondays');
    });

    it('sets nudge to null when no qualifying patterns exist', async () => {
      mockDetectRecurringPatterns.mockReturnValue([
        { id: '1', type: 'trigger', description: 'stress trigger', confidence: 0.9, frequency: 'weekly' },
        { id: '2', type: 'mood_cycle', description: 'weekly dip', confidence: 0.7, frequency: 'weekly' },
      ]);

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.nudge).toBeNull();
    });

    it('sets nudge to null when detectRecurringPatterns returns empty array', async () => {
      mockDetectRecurringPatterns.mockReturnValue([]);

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.nudge).toBeNull();
    });
  });

  describe('refresh()', () => {
    it('clears all arrays and hasNewPrompts before reloading', async () => {
      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Confirm state is populated first
      expect(result.current.generalPrompts).toHaveLength(6);
      expect(result.current.hasNewPrompts).toBe(true);

      // Track how many times load was triggered (getAllEntries calls)
      const callsBefore = mockGetAllEntries.mock.calls.length;

      result.current.refresh();

      // After refresh(), hasNewPrompts cleared synchronously and load re-triggers
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGetAllEntries.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(result.current.generalPrompts).toHaveLength(6);
      expect(result.current.hasNewPrompts).toBe(true);
    });
  });

  describe('isAIEnabled passthrough', () => {
    it('reflects settings.ai.enabled in isAIEnabled', async () => {
      const base = createDefaultSettings();
      useSettingsStore.setState({
        settings: {
          ...base,
          journal: { ...base.journal, showPrompts: true },
          ai: { ...base.ai, enabled: true },
          oura: { ...base.oura, enabled: false },
        },
      });
      mockGeneratePrompts.mockResolvedValue({ success: true, data: makePrompts(4) });

      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAIEnabled).toBe(true);
    });

    it('isAIEnabled=false when AI disabled', async () => {
      const { result } = renderHook(() => useJournalPrompts(true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isAIEnabled).toBe(false);
    });
  });
});
