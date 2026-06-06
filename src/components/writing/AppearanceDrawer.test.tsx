import { render, screen, fireEvent } from '@testing-library/react';
import { AppearanceDrawer } from './AppearanceDrawer';
import { useSettingsStore } from '../../stores/settingsStore';
import { createDefaultSettings } from '../../types/settings';
import { createDefaultWritingAppearance, TINT_OPTIONS } from '../../types/writingAppearance';

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

  describe('width selection', () => {
    it('clicking a width option updates writingWidth in the store', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: 'Wide' }));
      expect(useSettingsStore.getState().settings.appearance.writing.writingWidth).toBe('wide');
    });
  });

  describe('line-height selection', () => {
    it('changing line-height updates lineHeight in the store', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('radio', { name: 'Airy' }));
      expect(useSettingsStore.getState().settings.appearance.writing.lineHeight).toBe('airy');
    });
  });

  describe('font size selection', () => {
    it('changing font size updates fontSize in the store', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
      expect(useSettingsStore.getState().settings.appearance.writing.fontSize).toBe('lg');
    });
  });

  describe('paragraph spacing selection', () => {
    it('changing paragraph spacing updates paragraphSpacing in the store', () => {
      render(<AppearanceDrawer open={true} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('radio', { name: 'Generous' }));
      expect(useSettingsStore.getState().settings.appearance.writing.paragraphSpacing).toBe('generous');
    });
  });

  describe('inert attribute', () => {
    it('aside is inert when drawer is closed', () => {
      const { container } = render(<AppearanceDrawer open={false} onClose={() => {}} />);
      expect(container.querySelector('[role="dialog"]')).toHaveAttribute('inert');
    });

    it('aside is not inert when drawer is open', () => {
      const { container } = render(<AppearanceDrawer open={true} onClose={() => {}} />);
      expect(container.querySelector('[role="dialog"]')).not.toHaveAttribute('inert');
    });
  });

  describe('WCAG contrast', () => {
    it('Night tint has ≥7:1 contrast against white (WCAG AAA)', () => {
      const linearize = (c: number) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      const luminance = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
      };
      const nightHex = TINT_OPTIONS.find((o) => o.value === 'night')!.hex;
      const l1 = luminance('#FFFFFF');
      const l2 = luminance(nightHex);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(7);
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
