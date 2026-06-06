vi.mock('../../../hooks/usePlatform', () => ({ usePlatform: vi.fn() }));
vi.mock('../../updater/UpdatePanel', () => ({ UpdatePanel: () => <div>UpdatePanel</div> }));
vi.mock('../../../lib/services/logger', () => ({ logger: { error: vi.fn() } }));

import { render, screen } from '@testing-library/react';
import { AboutTab } from './AboutTab';
import { usePlatform } from '../../../hooks/usePlatform';
import type { AppSettings } from '../../../types/settings';
import type { UseUpdateCheckReturn } from '../../../hooks/useUpdateCheck';

const mockUsePlatform = vi.mocked(usePlatform);

const mockSettings = {
  version: 4,
  logLevel: 'warn',
  moduleLogLevels: {},
} as unknown as AppSettings;

const mockUpdateHook = {
  checking: false,
  updateAvailable: false,
  latestVersion: null,
  downloadUrl: null,
  releaseNotes: null,
  checkForUpdate: vi.fn(),
  downloading: false,
  downloadProgress: 0,
  downloadAndInstall: vi.fn(),
} as unknown as UseUpdateCheckReturn;

const baseProps = {
  settings: mockSettings,
  updateHook: mockUpdateHook,
  appVersion: '1.6.0',
  logPath: '/tmp/moodhaven.log',
  handleLogLevelChange: vi.fn(),
  setModuleLogLevel: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AboutTab — iOS platform gates', () => {
  it('renders UpdatePanel on desktop (not iOS)', () => {
    mockUsePlatform.mockReturnValue({ isIOS: false, isAndroid: false, isMobile: false, isBrowser: false, isDesktop: true });
    render(<AboutTab {...baseProps} />);
    expect(screen.getByText('UpdatePanel')).toBeInTheDocument();
  });

  it('does not render UpdatePanel on iOS', () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(<AboutTab {...baseProps} />);
    expect(screen.queryByText('UpdatePanel')).not.toBeInTheDocument();
  });

  it('renders the Log Level select on desktop', () => {
    mockUsePlatform.mockReturnValue({ isIOS: false, isAndroid: false, isMobile: false, isBrowser: false, isDesktop: true });
    render(<AboutTab {...baseProps} />);
    expect(screen.getByLabelText('Log level')).toBeInTheDocument();
  });

  it('does not render the Log Level select on iOS', () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(<AboutTab {...baseProps} />);
    expect(screen.queryByLabelText('Log level')).not.toBeInTheDocument();
  });

  it('does not render the Log Level select in browser mode', () => {
    mockUsePlatform.mockReturnValue({ isIOS: false, isAndroid: false, isMobile: false, isBrowser: true, isDesktop: false });
    render(<AboutTab {...baseProps} />);
    expect(screen.queryByLabelText('Log level')).not.toBeInTheDocument();
  });

  it('renders the app version on all platforms', () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(<AboutTab {...baseProps} />);
    expect(screen.getByText('v1.6.0')).toBeInTheDocument();
  });
});
