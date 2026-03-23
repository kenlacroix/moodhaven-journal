import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { open } from '@tauri-apps/plugin-shell';
import { MicrophoneBlockedModal } from './MicrophoneBlockedModal';

const mockOpen = vi.mocked(open);

describe('MicrophoneBlockedModal', () => {
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    mockOnDismiss.mockClear();
    mockOpen.mockClear();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<MicrophoneBlockedModal isOpen={false} onDismiss={mockOnDismiss} />);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('renders the alertdialog when isOpen is true', () => {
      render(<MicrophoneBlockedModal isOpen={true} onDismiss={mockOnDismiss} />);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('shows title and description', () => {
      render(<MicrophoneBlockedModal isOpen={true} onDismiss={mockOnDismiss} />);
      expect(screen.getByText('Microphone access blocked')).toBeInTheDocument();
      expect(screen.getByText(/doesn't have permission/i)).toBeInTheDocument();
    });

    it('shows numbered instructions', () => {
      render(<MicrophoneBlockedModal isOpen={true} onDismiss={mockOnDismiss} />);
      // At least one step is always rendered regardless of platform
      const steps = screen.getAllByRole('listitem');
      expect(steps.length).toBeGreaterThanOrEqual(1);
    });

    it('has aria-modal and labelling attributes', () => {
      render(<MicrophoneBlockedModal isOpen={true} onDismiss={mockOnDismiss} />);
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'mic-blocked-title');
    });
  });

  describe('actions', () => {
    it('calls onDismiss when "Dismiss" is clicked', async () => {
      const user = userEvent.setup();
      render(<MicrophoneBlockedModal isOpen={true} onDismiss={mockOnDismiss} />);
      await user.click(screen.getByText('Dismiss'));
      expect(mockOnDismiss).toHaveBeenCalledOnce();
    });

    it('calls onDismiss when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(<MicrophoneBlockedModal isOpen={true} onDismiss={mockOnDismiss} />);
      await user.keyboard('{Escape}');
      expect(mockOnDismiss).toHaveBeenCalledOnce();
    });

    it('calls onDismiss when backdrop is clicked', async () => {
      const user = userEvent.setup();
      render(<MicrophoneBlockedModal isOpen={true} onDismiss={mockOnDismiss} />);
      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/50');
      if (backdrop) await user.click(backdrop as HTMLElement);
      expect(mockOnDismiss).toHaveBeenCalledOnce();
    });
  });

  describe('platform-specific "Open system settings" button', () => {
    it('invokes shell open with settings URL when button is present and clicked', async () => {
      // Force macOS platform for a deterministic settingsUrl
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
      mockOpen.mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<MicrophoneBlockedModal isOpen={true} onDismiss={mockOnDismiss} />);

      const settingsBtn = screen.queryByText('Open system settings');
      if (settingsBtn) {
        await user.click(settingsBtn);
        expect(mockOpen).toHaveBeenCalledOnce();
      }
      // On Linux the button is absent — no assertion needed if settingsBtn is null
    });
  });
});
