/**
 * useSpeechToText tests
 *
 * Covers: A-05 (cancelledRef race), A-10 (isAvailable from ref), L2/L3 paths,
 * quickCapture, and model-not-downloaded guard.
 */

import { renderHook, act } from '@testing-library/react';
import { useSpeechToText } from './useSpeechToText';
import { useAudioRecorder } from './useAudioRecorder';
import { transcribeAudio, checkModelStatus } from '../lib/services/speechToTextService';
import { formatTranscript } from '../lib/services/aiService';
import { useSettingsStore } from '../stores/settingsStore';
import type { SpeechToTextSettings } from '../types/settings';

vi.mock('./useAudioRecorder');
vi.mock('../stores/settingsStore');
vi.mock('../lib/services/speechToTextService');
vi.mock('../lib/services/aiService');

// ── Shared mock state ─────────────────────────────────────────────────────────

const defaultSTTSettings: SpeechToTextSettings = {
  enabled: true,
  modelDownloaded: true,
  model: 'base.en',
  downloadProgress: null,
  formatting: { layer: 'local', cloudConsentGiven: false, consentDate: null },
};

const defaultAISettings = {
  localAI: { endpoint: '', model: 'llama2' },
  openai: { apiKey: null },
};

const mockCancelRecording = vi.fn();
const mockStopRecording = vi.fn();
const mockStartRecording = vi.fn();

function setupRecorderMock(stateOverride: string = 'idle') {
  vi.mocked(useAudioRecorder).mockReturnValue({
    state: stateOverride as ReturnType<typeof useAudioRecorder>['state'],
    error: null,
    permissionModal: 'none',
    elapsedSeconds: 0,
    startRecording: mockStartRecording,
    proceedAfterConsent: vi.fn(),
    dismissPermissionModal: vi.fn(),
    stopRecording: mockStopRecording,
    cancelRecording: mockCancelRecording,
  });
}

function setupSettingsMock(
  sttOverrides: Partial<SpeechToTextSettings> = {},
  aiOverrides: Partial<typeof defaultAISettings> = {}
) {
  const stt: SpeechToTextSettings = { ...defaultSTTSettings, ...sttOverrides };
  const ai = { ...defaultAISettings, ...aiOverrides };
  vi.mocked(useSettingsStore).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selector: (s: any) => any) => selector({ settings: { speechToText: stt, ai } })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupRecorderMock();
  setupSettingsMock();
  vi.mocked(checkModelStatus).mockResolvedValue({ downloaded: true, path: null, size: 0 });
  vi.mocked(transcribeAudio).mockResolvedValue({ text: 'hello world', duration: 1500 });
  vi.mocked(formatTranscript).mockResolvedValue({ formatted: 'Hello world.', source: 'local' });
  mockStopRecording.mockResolvedValue(new ArrayBuffer(8));
  mockStartRecording.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSpeechToText', () => {
  it('sets error and stays idle when model is not downloaded', async () => {
    vi.mocked(checkModelStatus).mockResolvedValueOnce({ downloaded: false, path: null, size: 0 });

    const { result } = renderHook(() => useSpeechToText());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.error).toMatch(/model not downloaded/i);
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('cancel() prevents stale formattedResult after transcribe completes', async () => {
    // Use ollama layer so transcription would normally proceed to formatting
    setupSettingsMock({ formatting: { layer: 'ollama' as const, cloudConsentGiven: false, consentDate: null } });

    let resolveTranscribe!: (v: { text: string; duration: number }) => void;
    vi.mocked(transcribeAudio).mockReturnValueOnce(
      new Promise((resolve) => { resolveTranscribe = resolve; })
    );

    const { result } = renderHook(() => useSpeechToText());

    // Kick off transcription without awaiting
    let transcribePromise!: Promise<string | null>;
    act(() => {
      transcribePromise = result.current.stopAndTranscribe();
    });

    // Cancel before transcribeAudio resolves
    act(() => {
      result.current.cancel();
    });

    // Now resolve transcribeAudio — the cancelled check should short-circuit
    await act(async () => {
      resolveTranscribe({ text: 'hello', duration: 1000 });
      await transcribePromise;
    });

    expect(result.current.formattedResult).toBeNull();
    expect(vi.mocked(formatTranscript)).not.toHaveBeenCalled();
  });

  it('cancel() prevents stale formattedResult after format completes', async () => {
    // Use ollama layer so transcription proceeds to formatting
    setupSettingsMock({ formatting: { layer: 'ollama' as const, cloudConsentGiven: false, consentDate: null } });

    let resolveFormat!: (v: { formatted: string; source: 'ollama' | 'openai' | 'local' }) => void;
    vi.mocked(formatTranscript).mockReturnValueOnce(
      new Promise((resolve) => { resolveFormat = resolve; })
    );

    const { result } = renderHook(() => useSpeechToText());

    let transcribePromise!: Promise<string | null>;
    act(() => {
      transcribePromise = result.current.stopAndTranscribe();
    });

    // Wait for transcribeAudio to complete (it resolves immediately from mock)
    await act(async () => {
      await vi.mocked(transcribeAudio).mock.results[0]?.value;
    });

    // Cancel after transcribe but before format resolves
    act(() => {
      result.current.cancel();
    });

    // Resolve format — the cancelled check should short-circuit
    await act(async () => {
      resolveFormat({ formatted: 'Better text.', source: 'ollama' });
      await transcribePromise;
    });

    expect(result.current.formattedResult).toBeNull();
  });

  it('quickCapture bypasses formatting and returns raw text', async () => {
    const { result } = renderHook(() => useSpeechToText());

    // Enable quick capture mode
    act(() => {
      result.current.toggleQuickCapture();
    });

    let returnedText: string | null = null;
    await act(async () => {
      returnedText = await result.current.stopAndTranscribe();
    });

    expect(returnedText).toBe('hello world');
    expect(vi.mocked(formatTranscript)).not.toHaveBeenCalled();
  });

  it('L2/L3 path stores formattedResult and returns null from stopAndTranscribe', async () => {
    setupSettingsMock({ formatting: { layer: 'ollama' as const, cloudConsentGiven: false, consentDate: null } });
    vi.mocked(formatTranscript).mockResolvedValueOnce({
      formatted: 'Better text.',
      source: 'ollama',
    });

    const { result } = renderHook(() => useSpeechToText());

    let returnValue: string | null = undefined as unknown as null;
    await act(async () => {
      returnValue = await result.current.stopAndTranscribe();
    });

    expect(returnValue).toBeNull();
    expect(result.current.formattedResult).toEqual({
      formatted: 'Better text.',
      raw: 'hello world',
      source: 'ollama',
    });
  });

  it('L2/L3 fallback to local returns text directly without showing overlay', async () => {
    setupSettingsMock({ formatting: { layer: 'ollama' as const, cloudConsentGiven: false, consentDate: null } });
    // Simulate ollama falling back to local
    vi.mocked(formatTranscript).mockResolvedValueOnce({
      formatted: 'Cleaned text.',
      source: 'local',
    });

    const { result } = renderHook(() => useSpeechToText());

    let returnValue: string | null = null;
    await act(async () => {
      returnValue = await result.current.stopAndTranscribe();
    });

    expect(returnValue).toBe('Cleaned text.');
    expect(result.current.formattedResult).toBeNull();
  });

  it('isAvailable is false initially regardless of settings.modelDownloaded (A-10)', () => {
    // settings.modelDownloaded = true, but availabilityResultRef starts false
    // Before A-10 fix: isAvailable would be true here
    // After A-10 fix: isAvailable reflects availabilityResultRef (false until checked)
    setupSettingsMock({ enabled: true, modelDownloaded: true });

    const { result } = renderHook(() => useSpeechToText());

    expect(result.current.isAvailable).toBe(false);
  });
});
