vi.mock('../../hooks/usePlatform', () => ({ usePlatform: vi.fn() }));
vi.mock('../../stores/peerSyncStore', () => ({ usePeerSyncStore: vi.fn() }));
vi.mock('../../stores/settingsStore', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../../lib/services/peerDiscoveryService', () => ({
  startDiscovery: vi.fn(),
  stopDiscovery: vi.fn(),
}));
vi.mock('./PairingModal', () => ({ PairingModal: () => null }));
vi.mock('./TrustedDevicesList', () => ({ TrustedDevicesList: () => null }));
vi.mock('./DevicesThisDevice', () => ({ ThisDeviceCard: () => null }));
vi.mock('./DevicesNearby', () => ({ NearbyPeerRow: () => null, EmptyNearby: () => null }));
vi.mock('./DeviceIconSet', () => ({ ScanningDots: () => null }));
vi.mock('./DevicesSyncOptions', () => ({ DevicesSyncOptions: () => null }));
vi.mock('../../lib/services/logger', () => ({ logger: { error: vi.fn() } }));

import { render, screen } from '@testing-library/react';
import { DevicesTab } from './DevicesTab';
import { usePlatform } from '../../hooks/usePlatform';
import { usePeerSyncStore } from '../../stores/peerSyncStore';
import { useSettingsStore } from '../../stores/settingsStore';

const mockUsePlatform = vi.mocked(usePlatform);
const mockUsePeerSyncStore = vi.mocked(usePeerSyncStore);
const mockUseSettingsStore = vi.mocked(useSettingsStore);

const storeState = {
  settings: { sync: { peerSyncLanOnly: false, peerSyncIntervalSecs: 30 } },
  setPeerSyncLanOnly: vi.fn(),
  setPeerSyncIntervalSecs: vi.fn(),
  saveSettings: vi.fn(),
};

function setupMocks() {
  mockUsePeerSyncStore.mockReturnValue({
    identity: null,
    identityLoading: false,
    isDiscovering: false,
    nearbyPeers: [],
    setDiscovering: vi.fn(),
    clearPeers: vi.fn(),
  } as ReturnType<typeof usePeerSyncStore>);
  // Selector-based store mock
  (mockUseSettingsStore as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: typeof storeState) => unknown) => sel(storeState)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

describe('DevicesTab — iOS gate', () => {
  it('shows iOS placeholder when isIOS is true', () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(<DevicesTab />);
    expect(screen.getByText('Peer sync is not available on iOS')).toBeInTheDocument();
    expect(screen.getByText(/Use Dropbox or Google Drive/)).toBeInTheDocument();
  });

  it('does not render the Local Sync toggle on iOS', () => {
    mockUsePlatform.mockReturnValue({ isIOS: true, isAndroid: false, isMobile: true, isBrowser: false, isDesktop: false });
    render(<DevicesTab />);
    expect(screen.queryByText('Local Sync')).not.toBeInTheDocument();
  });

  it('shows browser placeholder when isBrowser is true', () => {
    mockUsePlatform.mockReturnValue({ isIOS: false, isAndroid: false, isMobile: false, isBrowser: true, isDesktop: false });
    render(<DevicesTab />);
    expect(screen.getByText('LAN Sync requires the desktop app')).toBeInTheDocument();
  });

  it('renders the Local Sync toggle on desktop (not iOS, not browser)', () => {
    mockUsePlatform.mockReturnValue({ isIOS: false, isAndroid: false, isMobile: false, isBrowser: false, isDesktop: true });
    render(<DevicesTab />);
    expect(screen.getByText('Local Sync')).toBeInTheDocument();
  });
});
