import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileVoiceCapture, arrayBufferToBase64 } from './MobileVoiceCapture';
import {
  storeVoiceMemoBytes,
  listVoiceMemos,
  deleteVoiceMemo,
  type VoiceMemo,
} from '../../lib/services/voiceMemoService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../lib/services/voiceMemoService', () => ({
  storeVoiceMemoBytes: vi.fn(),
  listVoiceMemos: vi.fn(),
  deleteVoiceMemo: vi.fn(),
}));

vi.mock('../../lib/services/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mutable recorder mock — tests mutate fields then re-render to drive UI states.
const recorder: {
  state: 'idle' | 'requesting' | 'recording' | 'processing';
  error: string | null;
  permissionModal: 'none' | 'consent' | 'blocked';
  elapsedSeconds: number;
  startRecording: ReturnType<typeof vi.fn>;
  proceedAfterConsent: ReturnType<typeof vi.fn>;
  dismissPermissionModal: ReturnType<typeof vi.fn>;
  stopRecording: ReturnType<typeof vi.fn>;
  cancelRecording: ReturnType<typeof vi.fn>;
} = {
  state: 'idle',
  error: null,
  permissionModal: 'none',
  elapsedSeconds: 0,
  startRecording: vi.fn().mockResolvedValue(undefined),
  proceedAfterConsent: vi.fn().mockResolvedValue(undefined),
  dismissPermissionModal: vi.fn(),
  stopRecording: vi.fn().mockResolvedValue(null),
  cancelRecording: vi.fn(),
};

vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => recorder,
}));

const mockStore = vi.mocked(storeVoiceMemoBytes);
const mockList = vi.mocked(listVoiceMemos);
const mockDelete = vi.mocked(deleteVoiceMemo);

function resetRecorder(): void {
  recorder.state = 'idle';
  recorder.error = null;
  recorder.permissionModal = 'none';
  recorder.elapsedSeconds = 0;
  recorder.startRecording = vi.fn().mockResolvedValue(undefined);
  recorder.proceedAfterConsent = vi.fn().mockResolvedValue(undefined);
  recorder.dismissPermissionModal = vi.fn();
  recorder.stopRecording = vi.fn().mockResolvedValue(null);
  recorder.cancelRecording = vi.fn();
}

const queuedMemo: VoiceMemo = {
  id: 'memo-1',
  timestamp: '2026-06-12T10:30:00Z',
  duration_ms: 65_000,
  health_json: null,
  file_path: 'voice_memos/memo-1.wav',
  transcription: null,
  rawTranscription: null,
  entry_id: null,
  source: 'phone',
  created_at: '2026-06-12T10:30:00Z',
  book_id: 'default',
  reviewed: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRecorder();
  mockList.mockResolvedValue([]);
  mockStore.mockResolvedValue(queuedMemo);
  mockDelete.mockResolvedValue(undefined);
});

// ── Idle state ──────────────────────────────────────────────────────────────────

describe('MobileVoiceCapture — idle', () => {
  it('renders the record button and refreshes the queue on mount', async () => {
    render(<MobileVoiceCapture />);
    expect(
      screen.getByRole('button', { name: 'Record voice memo' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  });

  it('starts recording when the record button is clicked', async () => {
    render(<MobileVoiceCapture />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Record voice memo' }),
    );
    expect(recorder.startRecording).toHaveBeenCalledTimes(1);
  });

  it('filters the queue to untranscribed, unreviewed memos', async () => {
    mockList.mockResolvedValue([
      queuedMemo,
      { ...queuedMemo, id: 'transcribed', transcription: 'done' },
      { ...queuedMemo, id: 'reviewed', reviewed: 1 },
    ]);
    render(<MobileVoiceCapture />);
    await screen.findByText('Queued for desktop sync');
    // Only one (the untranscribed/unreviewed) memo is shown.
    expect(
      screen.getAllByRole('button', { name: 'Delete voice memo' }),
    ).toHaveLength(1);
  });
});

// ── Recording / stop flow ───────────────────────────────────────────────────────

describe('MobileVoiceCapture — recording', () => {
  it('shows the recording strip while recording', () => {
    recorder.state = 'recording';
    recorder.elapsedSeconds = 5;
    render(<MobileVoiceCapture />);
    expect(
      screen.getByRole('button', { name: 'Stop recording' }),
    ).toBeInTheDocument();
  });

  it('stores the memo and shows a confirmation on stop', async () => {
    const buf = new TextEncoder().encode('fake-wav-bytes').buffer;
    recorder.state = 'recording';
    recorder.elapsedSeconds = 3;
    recorder.stopRecording = vi.fn().mockResolvedValue(buf);

    render(<MobileVoiceCapture />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop recording' }),
    );

    await waitFor(() => expect(mockStore).toHaveBeenCalledTimes(1));
    const [id, timestamp, durationMs, base64] = mockStore.mock.calls[0];
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(typeof timestamp).toBe('string');
    expect(durationMs).toBe(3000);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    await screen.findByRole('status');
    expect(screen.getByRole('status')).toHaveTextContent(/transcribe/i);
  });

  it('does not store when stopRecording returns no buffer', async () => {
    recorder.state = 'recording';
    recorder.stopRecording = vi.fn().mockResolvedValue(null);
    render(<MobileVoiceCapture />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop recording' }),
    );
    await waitFor(() => expect(recorder.stopRecording).toHaveBeenCalled());
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('shows an error confirmation when storing fails', async () => {
    const buf = new TextEncoder().encode('bytes').buffer;
    recorder.state = 'recording';
    recorder.stopRecording = vi.fn().mockResolvedValue(buf);
    mockStore.mockRejectedValue(new Error('disk full'));

    render(<MobileVoiceCapture />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop recording' }),
    );

    const status = await screen.findByText(/Could not save voice memo/i);
    expect(status).toBeInTheDocument();
  });

  it('cancels the recording via the strip', async () => {
    recorder.state = 'recording';
    render(<MobileVoiceCapture />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel recording' }),
    );
    expect(recorder.cancelRecording).toHaveBeenCalledTimes(1);
  });
});

// ── Permission states ───────────────────────────────────────────────────────────

describe('MobileVoiceCapture — permission prompts', () => {
  it('renders the consent prompt and proceeds on Allow access', async () => {
    recorder.permissionModal = 'consent';
    render(<MobileVoiceCapture />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Allow access' }),
    );
    expect(recorder.proceedAfterConsent).toHaveBeenCalledTimes(1);
  });

  it('dismisses the consent prompt on Not now', async () => {
    recorder.permissionModal = 'consent';
    render(<MobileVoiceCapture />);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(recorder.dismissPermissionModal).toHaveBeenCalledTimes(1);
  });

  it('renders the blocked banner and dismisses it', async () => {
    recorder.permissionModal = 'blocked';
    render(<MobileVoiceCapture />);
    expect(screen.getByText(/Microphone access is blocked/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(recorder.dismissPermissionModal).toHaveBeenCalledTimes(1);
  });

  it('surfaces a recorder error when idle with no permission modal', () => {
    recorder.error = 'Microphone error: boom';
    render(<MobileVoiceCapture />);
    expect(screen.getByText('Microphone error: boom')).toBeInTheDocument();
  });
});

// ── Queue management ────────────────────────────────────────────────────────────

describe('MobileVoiceCapture — queue', () => {
  it('renders queued memos with formatted duration', async () => {
    mockList.mockResolvedValue([queuedMemo]);
    render(<MobileVoiceCapture />);
    await screen.findByText('Queued for desktop sync');
    // 65_000 ms → "1m 5s"
    expect(screen.getByText(/1m 5s/)).toBeInTheDocument();
  });

  it('deletes a queued memo and refreshes the list', async () => {
    mockList.mockResolvedValueOnce([queuedMemo]).mockResolvedValueOnce([]);
    render(<MobileVoiceCapture />);
    await screen.findByText('Queued for desktop sync');

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete voice memo' }),
    );
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('memo-1'),
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Queued for desktop sync'),
      ).not.toBeInTheDocument(),
    );
  });

  it('hides the queue section when there are no pending memos', async () => {
    mockList.mockResolvedValue([]);
    render(<MobileVoiceCapture />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(
      screen.queryByText('Queued for desktop sync'),
    ).not.toBeInTheDocument();
  });

  it('swallows a list failure without crashing', async () => {
    mockList.mockRejectedValue(new Error('db locked'));
    render(<MobileVoiceCapture />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    // Still renders the idle record button.
    expect(
      screen.getByRole('button', { name: 'Record voice memo' }),
    ).toBeInTheDocument();
  });

  it('swallows a delete failure without crashing', async () => {
    mockList.mockResolvedValue([queuedMemo]);
    mockDelete.mockRejectedValue(new Error('delete blew up'));
    render(<MobileVoiceCapture />);
    await screen.findByText('Queued for desktop sync');

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete voice memo' }),
    );
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    // Section is still present (delete failed, refresh not reached).
    expect(screen.getByText('Queued for desktop sync')).toBeInTheDocument();
  });
});

// ── Audio encoding error path ───────────────────────────────────────────────────

describe('MobileVoiceCapture — base64 encoding failure', () => {
  it('shows an error confirmation when the FileReader fails', async () => {
    // Force FileReader.readAsDataURL to invoke onerror so arrayBufferToBase64 rejects.
    const RealFileReader = globalThis.FileReader;
    class FailingFileReader {
      onerror: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
      onload: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
      error: DOMException | null = new DOMException('boom');
      readAsDataURL(): void {
        queueMicrotask(() => this.onerror?.call(this as never, {} as ProgressEvent));
      }
    }
    vi.stubGlobal('FileReader', FailingFileReader);

    const buf = new TextEncoder().encode('bytes').buffer;
    recorder.state = 'recording';
    recorder.stopRecording = vi.fn().mockResolvedValue(buf);

    try {
      render(<MobileVoiceCapture />);
      await userEvent.click(
        screen.getByRole('button', { name: 'Stop recording' }),
      );
      const status = await screen.findByText(/Could not save voice memo/i);
      expect(status).toBeInTheDocument();
      expect(mockStore).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('FileReader', RealFileReader);
    }
  });
});

// ── arrayBufferToBase64 (unit) ──────────────────────────────────────────────────

describe('arrayBufferToBase64', () => {
  it('strips the data-URL prefix and returns the base64 payload', async () => {
    const out = await arrayBufferToBase64(new TextEncoder().encode('ABC').buffer);
    expect(out).toBe('QUJD');
  });

  it('rejects when FileReader yields a non-string result', async () => {
    const RealFileReader = globalThis.FileReader;
    class NonStringFileReader {
      onerror: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
      onload: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
      result: ArrayBuffer | string | null = new ArrayBuffer(4); // not a string
      readAsDataURL(): void {
        queueMicrotask(() => this.onload?.call(this as never, {} as ProgressEvent));
      }
    }
    vi.stubGlobal('FileReader', NonStringFileReader);
    try {
      await expect(
        arrayBufferToBase64(new TextEncoder().encode('xy').buffer),
      ).rejects.toThrow('Unexpected FileReader result');
    } finally {
      vi.stubGlobal('FileReader', RealFileReader);
    }
  });
});
