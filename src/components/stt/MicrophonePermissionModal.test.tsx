import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';

describe('MicrophonePermissionModal', () => {
  const mockOnAllow = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    mockOnAllow.mockClear();
    mockOnCancel.mockClear();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <MicrophonePermissionModal
          isOpen={false}
          onAllow={mockOnAllow}
          onCancel={mockOnCancel}
        />
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the dialog when isOpen is true', () => {
      render(
        <MicrophonePermissionModal
          isOpen={true}
          onAllow={mockOnAllow}
          onCancel={mockOnCancel}
        />
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('shows the title and privacy message', () => {
      render(
        <MicrophonePermissionModal
          isOpen={true}
          onAllow={mockOnAllow}
          onCancel={mockOnCancel}
        />
      );
      expect(screen.getByText('Microphone access needed')).toBeInTheDocument();
      expect(screen.getByText(/locally on your device/i)).toBeInTheDocument();
    });

    it('has aria-modal and labelling attributes', () => {
      render(
        <MicrophonePermissionModal
          isOpen={true}
          onAllow={mockOnAllow}
          onCancel={mockOnCancel}
        />
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'mic-permission-title');
    });
  });

  describe('actions', () => {
    it('calls onAllow when "Allow access" is clicked', async () => {
      const user = userEvent.setup();
      render(
        <MicrophonePermissionModal
          isOpen={true}
          onAllow={mockOnAllow}
          onCancel={mockOnCancel}
        />
      );
      await user.click(screen.getByText('Allow access'));
      expect(mockOnAllow).toHaveBeenCalledOnce();
    });

    it('calls onCancel when "Cancel" is clicked', async () => {
      const user = userEvent.setup();
      render(
        <MicrophonePermissionModal
          isOpen={true}
          onAllow={mockOnAllow}
          onCancel={mockOnCancel}
        />
      );
      await user.click(screen.getByText('Cancel'));
      expect(mockOnCancel).toHaveBeenCalledOnce();
    });

    it('calls onCancel when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(
        <MicrophonePermissionModal
          isOpen={true}
          onAllow={mockOnAllow}
          onCancel={mockOnCancel}
        />
      );
      await user.keyboard('{Escape}');
      expect(mockOnCancel).toHaveBeenCalledOnce();
    });

    it('calls onCancel when backdrop is clicked', async () => {
      const user = userEvent.setup();
      render(
        <MicrophonePermissionModal
          isOpen={true}
          onAllow={mockOnAllow}
          onCancel={mockOnCancel}
        />
      );
      // Backdrop has aria-hidden so query by its class characteristic
      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/50');
      if (backdrop) await user.click(backdrop as HTMLElement);
      expect(mockOnCancel).toHaveBeenCalledOnce();
    });
  });
});
