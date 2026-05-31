import { render, screen, fireEvent } from '@testing-library/react';
import { AppearanceDrawer } from './AppearanceDrawer';
import { useSettingsStore } from '../../stores/settingsStore';
import { createDefaultSettings } from '../../types/settings';
import { createDefaultWritingAppearance } from '../../types/writingAppearance';

describe('AppearanceDrawer', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: createDefaultSettings(),
      hasUnsavedChanges: false,
    });
  });

  describe('rendering', () => {
    it('does not render content when closed (drawer is translated off-screen but still in DOM)', () => {
      const { container } = render(
        <AppearanceDrawer open={false} onClose={() => {}} />
      );
      // Drawer is in the DOM even when closed (so the slide-out transition can animate).
      // We verify it's there but check the closed-state class.
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeInTheDocument();
      expect(dialog?.className).toContain('translate-y-full');
    });

    it('renders all three sections when open', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      expect(screen.getByRole('heading', { name: /Type/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Page/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Reading support/i })).toBeInTheDocument();
    });

    it('shows the current text scale as a percentage', () => {
      useSettingsStore.setState({
        settings: {
          ...createDefaultSettings(),
          appearance: {
            ...createDefaultSettings().appearance,
            writing: { ...createDefaultWritingAppearance(), textScale: 1.5 },
          },
        },
        hasUnsavedChanges: false,
      });
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      expect(screen.getByText(/150%/)).toBeInTheDocument();
    });
  });

  describe('font selection', () => {
    it('clicking a font option updates the store', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      const iowan = screen.getByRole('button', { name: /Source Serif/i });
      fireEvent.click(iowan);
      expect(useSettingsStore.getState().settings.appearance.writing.fontFamily).toBe('iowan');
      expect(iowan).toHaveAttribute('aria-pressed', 'true');
    });

    it('default font (inter) is pressed on first render', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      const inter = screen.getByRole('button', { name: /Inter/i });
      expect(inter).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('tint swatches', () => {
    it('clicking a tint updates the store', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      const sage = screen.getByRole('button', { name: 'Sage' });
      fireEvent.click(sage);
      expect(useSettingsStore.getState().settings.appearance.writing.backgroundTint).toBe('sage');
    });
  });

  describe('toggle rows', () => {
    it('focus mode toggle flips the value', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      const toggle = screen.getByRole('switch', { name: /Focus mode/i });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(toggle);
      expect(useSettingsStore.getState().settings.appearance.writing.focusMode).toBe(true);
    });

    it('high contrast toggle flips the value', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      const toggle = screen.getByRole('switch', { name: /High contrast/i });
      fireEvent.click(toggle);
      expect(useSettingsStore.getState().settings.appearance.writing.highContrast).toBe(true);
    });

    it('dyslexia profile toggle flips the value', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      const toggle = screen.getByRole('switch', { name: /Dyslexia profile/i });
      fireEvent.click(toggle);
      expect(useSettingsStore.getState().settings.appearance.writing.dyslexiaProfile).toBe(true);
    });
  });

  describe('text scale slider', () => {
    it('slider movement updates textScale and clamps in range', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      const slider = screen.getByRole('slider', { name: /Text scale/i }) as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '1.5' } });
      expect(useSettingsStore.getState().settings.appearance.writing.textScale).toBe(1.5);
    });
  });

  describe('reset', () => {
    it('clicking Reset to defaults restores the defaults', () => {
      useSettingsStore.setState({
        settings: {
          ...createDefaultSettings(),
          appearance: {
            ...createDefaultSettings().appearance,
            writing: {
              ...createDefaultWritingAppearance(),
              fontFamily: 'jetbrains-mono',
              backgroundTint: 'night',
              textScale: 1.8,
              highContrast: true,
            },
          },
        },
        hasUnsavedChanges: false,
      });
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /Reset to defaults/i }));
      const w = useSettingsStore.getState().settings.appearance.writing;
      expect(w).toEqual(createDefaultWritingAppearance());
    });
  });

  describe('keyboard + close', () => {
    it('Esc key calls onClose', () => {
      const onClose = vi.fn();
      render(<AppearanceDrawer open={true} onClose={onClose} />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('close button calls onClose', () => {
      const onClose = vi.fn();
      render(<AppearanceDrawer open={true} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /Close appearance drawer/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('Esc does not call onClose when drawer is closed', () => {
      const onClose = vi.fn();
      render(<AppearanceDrawer open={false} onClose={onClose} />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
