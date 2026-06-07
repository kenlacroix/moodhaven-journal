vi.mock('../../hooks/usePlatform', () => ({ usePlatform: vi.fn() }));
vi.mock('../../stores/settingsStore', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../../lib/services/windowUtils', () => ({ toggleFullscreen: vi.fn().mockResolvedValue(undefined) }));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FocusMenu } from './FocusMenu';
import { usePlatform } from '../../hooks/usePlatform';
import { useSettingsStore } from '../../stores/settingsStore';

const mockUsePlatform = vi.mocked(usePlatform);
const mockUseSettingsStore = vi.mocked(useSettingsStore);

function setupStoreMock() {
  (mockUseSettingsStore as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: { distractionFree: boolean; setDistractionFree: () => void }) => unknown) =>
      sel({ distractionFree: false, setDistractionFree: vi.fn() })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupStoreMock();
});

describe('FocusMenu — iOS breakout gate', () => {
  it('shows the Breakout writer button when isIOS is false', async () => {
    mockUsePlatform.mockReturnValue({ isIOS: false, isAndroid: false, isMobile: false, isBrowser: false, isDesktop: true });
    render(<FocusMenu onOpenBreakout={vi.fn()} />);

    await userEvent.click(screen.getByTitle('Focus & window options'));

    expect(screen.getByText('Breakout writer')).toBeInTheDocument();
  });

  it('does not show the Breakout writer button when isIOS is true', async () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(<FocusMenu onOpenBreakout={vi.fn()} />);

    await userEvent.click(screen.getByTitle('Focus & window options'));

    expect(screen.queryByText('Breakout writer')).not.toBeInTheDocument();
  });

  it('still shows Focus mode and Fullscreen on iOS', async () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(<FocusMenu onOpenBreakout={vi.fn()} />);

    await userEvent.click(screen.getByTitle('Focus & window options'));

    expect(screen.getByText('Focus mode')).toBeInTheDocument();
    expect(screen.getByText('Fullscreen')).toBeInTheDocument();
  });
});
