import { render, screen } from '@testing-library/react';
import { UpdatePanel } from './UpdatePanel';
import type { UseUpdateCheckReturn } from '../../hooks/useUpdateCheck';

vi.mock('dompurify', () => ({
  default: { sanitize: vi.fn((html: string) => html) },
}));

import DOMPurifyMock from 'dompurify';
const mockSanitize = vi.mocked(DOMPurifyMock.sanitize);

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      settings: { updates: { autoCheck: true, lastChecked: null } },
      setUpdateAutoCheck: vi.fn(),
      saveSettings: vi.fn(),
    })
  ),
}));

vi.mock('../../hooks/usePlatform', () => ({
  usePlatform: vi.fn(() => ({ isBrowser: false })),
}));

// Verify sanitize is wired in — even when using a passthrough mock, at minimum
// the call must happen so a real DOMPurify instance would strip dangerous content.
// The actual sanitization is tested by DOMPurify's own test suite.
function makeHook(overrides: Partial<UseUpdateCheckReturn> = {}): UseUpdateCheckReturn {
  return {
    updateInfo: null,
    isChecking: false,
    checkError: null,
    checkNow: vi.fn(),
    skipVersion: vi.fn(),
    clearSkip: vi.fn(),
    ...overrides,
  };
}

describe('UpdatePanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders "Check now" button when no update info', () => {
    render(<UpdatePanel hook={makeHook()} currentVersion="0.8.4" />);
    expect(screen.getByText('Check now')).toBeInTheDocument();
  });

  it('applies DOMPurify.sanitize to release notes HTML before render', () => {
    const sanitize = mockSanitize;
    const notes = '## What is new\n- Fixed a bug';
    render(
      <UpdatePanel
        hook={makeHook({
          updateInfo: {
            is_available: true,
            version: '0.9.0',
            notes,
            can_self_update: false,
            asset: null,
            release_url: null,
            pub_date: null,
          } as Parameters<typeof makeHook>[0]['updateInfo'] & object,
        })}
        currentVersion="0.8.4"
      />
    );
    expect(sanitize).toHaveBeenCalledWith(expect.stringContaining('What is new'));
  });

  it('passes rendered HTML string (not raw markdown) to DOMPurify.sanitize', () => {
    const notes = '## Title\n**bold text**';
    render(
      <UpdatePanel
        hook={makeHook({
          updateInfo: {
            is_available: true,
            version: '0.9.0',
            notes,
            can_self_update: false,
            asset: null,
            release_url: null,
            pub_date: null,
          } as Parameters<typeof makeHook>[0]['updateInfo'] & object,
        })}
        currentVersion="0.8.4"
      />
    );
    // renderMarkdown converts markdown → HTML before sanitize — verify HTML tags are present
    expect(mockSanitize).toHaveBeenCalledWith(expect.stringContaining('<strong>'));
  });

  it('does not call DOMPurify when release notes are absent', () => {
    const sanitize = mockSanitize;
    render(
      <UpdatePanel
        hook={makeHook({
          updateInfo: {
            is_available: true,
            version: '0.9.0',
            notes: null,
            can_self_update: false,
            asset: null,
            release_url: null,
            pub_date: null,
          } as Parameters<typeof makeHook>[0]['updateInfo'] & object,
        })}
        currentVersion="0.8.4"
      />
    );
    expect(sanitize).not.toHaveBeenCalled();
  });
});
