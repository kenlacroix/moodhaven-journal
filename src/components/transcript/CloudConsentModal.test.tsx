import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloudConsentModal } from './CloudConsentModal';

describe('CloudConsentModal', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    mockOnConfirm.mockClear();
    mockOnCancel.mockClear();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <CloudConsentModal isOpen={false} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
      );
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('renders the dialog when isOpen is true', () => {
      render(
        <CloudConsentModal isOpen={true} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
      );
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('mentions cloud formatting sending data to OpenAI', () => {
      render(
        <CloudConsentModal isOpen={true} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
      );
      expect(screen.getByText(/openai/i)).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('calls onConfirm when the confirm button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <CloudConsentModal isOpen={true} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
      );
      await user.click(screen.getByRole('button', { name: /enable|understand|confirm/i }));
      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when the Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <CloudConsentModal isOpen={true} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
      );
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(
        <CloudConsentModal isOpen={true} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
      );
      await user.keyboard('{Escape}');
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('has aria-modal="true"', () => {
      render(
        <CloudConsentModal isOpen={true} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
      );
      expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-modal', 'true');
    });
  });
});
