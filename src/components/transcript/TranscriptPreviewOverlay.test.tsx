import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranscriptPreviewOverlay } from './TranscriptPreviewOverlay';

describe('TranscriptPreviewOverlay', () => {
  const mockOnUseFormatted = vi.fn();
  const mockOnEditFirst = vi.fn();
  const mockOnUseRaw = vi.fn();

  const defaultProps = {
    isOpen: true,
    formattedText: 'This is the formatted transcript.',
    rawText: 'this is the raw transcript',
    source: 'ollama' as const,
    onUseFormatted: mockOnUseFormatted,
    onEditFirst: mockOnEditFirst,
    onUseRaw: mockOnUseRaw,
  };

  beforeEach(() => {
    mockOnUseFormatted.mockClear();
    mockOnEditFirst.mockClear();
    mockOnUseRaw.mockClear();
  });

  describe('visibility', () => {
    it('hides the sheet (translate-y-full) when isOpen is false', () => {
      render(<TranscriptPreviewOverlay {...defaultProps} isOpen={false} />);
      // Component uses CSS slide animation — dialog stays in DOM but slides out
      expect(screen.getByRole('dialog')).toHaveClass('translate-y-full');
    });

    it('shows the sheet (translate-y-0) when isOpen is true', () => {
      render(<TranscriptPreviewOverlay {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveClass('translate-y-0');
    });
  });

  describe('content', () => {
    it('displays the formatted transcript text', () => {
      render(<TranscriptPreviewOverlay {...defaultProps} />);
      expect(screen.getByText('This is the formatted transcript.')).toBeInTheDocument();
    });

    it('shows the Ollama source pill', () => {
      render(<TranscriptPreviewOverlay {...defaultProps} source="ollama" />);
      expect(screen.getByText('Ollama')).toBeInTheDocument();
    });

    it('shows the OpenAI source pill', () => {
      render(<TranscriptPreviewOverlay {...defaultProps} source="openai" />);
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });

    it('hides source pill when source is null', () => {
      render(<TranscriptPreviewOverlay {...defaultProps} source={null} />);
      expect(screen.queryByText('Ollama')).not.toBeInTheDocument();
      expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('calls onUseFormatted when "Use this" is clicked', async () => {
      const user = userEvent.setup();
      render(<TranscriptPreviewOverlay {...defaultProps} />);
      await user.click(screen.getByRole('button', { name: /use this/i }));
      expect(mockOnUseFormatted).toHaveBeenCalledTimes(1);
    });

    it('calls onEditFirst when "Edit first" is clicked', async () => {
      const user = userEvent.setup();
      render(<TranscriptPreviewOverlay {...defaultProps} />);
      await user.click(screen.getByRole('button', { name: /edit first/i }));
      expect(mockOnEditFirst).toHaveBeenCalledTimes(1);
    });

    it('calls onUseRaw when "Use raw text" is clicked', async () => {
      const user = userEvent.setup();
      render(<TranscriptPreviewOverlay {...defaultProps} />);
      await user.click(screen.getByRole('button', { name: /use raw text/i }));
      expect(mockOnUseRaw).toHaveBeenCalledTimes(1);
    });

    it('calls onUseRaw when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(<TranscriptPreviewOverlay {...defaultProps} />);
      await user.keyboard('{Escape}');
      expect(mockOnUseRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('has aria-modal="true"', () => {
      render(<TranscriptPreviewOverlay {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });
  });
});
