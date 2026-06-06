vi.mock('../../hooks/usePlatform', () => ({ usePlatform: vi.fn() }));

import { render, screen } from '@testing-library/react';
import { CollapsibleToolbar } from './EditorToolbar';
import { usePlatform } from '../../hooks/usePlatform';
import type { Editor } from '@tiptap/react';

const mockUsePlatform = vi.mocked(usePlatform);

const mockEditor = {
  on: vi.fn(),
  off: vi.fn(),
} as unknown as Editor;

const baseProps = {
  editor: mockEditor,
  onFormat: vi.fn(),
  getFormatState: () => ({}),
  expanded: true,
  onToggle: vi.fn(),
  onLinkClick: vi.fn(),
  onEmojiClick: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CollapsibleToolbar — iOS STT gate', () => {
  it('renders the mic button when isIOS is false and onMicClick is provided', () => {
    mockUsePlatform.mockReturnValue({ isIOS: false, isAndroid: false, isMobile: false, isBrowser: false, isDesktop: true });
    render(
      <CollapsibleToolbar
        {...baseProps}
        sttReady
        sttState="idle"
        onMicClick={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Start dictation' })).toBeInTheDocument();
  });

  it('does not render the mic button when isIOS is true, even with onMicClick provided', () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(
      <CollapsibleToolbar
        {...baseProps}
        sttReady
        sttState="idle"
        onMicClick={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Start dictation' })).not.toBeInTheDocument();
  });

  it('does not render the mic button when onMicClick is not provided, regardless of platform', () => {
    mockUsePlatform.mockReturnValue({ isIOS: false, isAndroid: false, isMobile: false, isBrowser: false, isDesktop: true });
    render(<CollapsibleToolbar {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Start dictation' })).not.toBeInTheDocument();
  });

  it('renders standard formatting buttons on iOS', () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(<CollapsibleToolbar {...baseProps} onMicClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Bold (Ctrl+B)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic (Ctrl+I)' })).toBeInTheDocument();
  });
});
