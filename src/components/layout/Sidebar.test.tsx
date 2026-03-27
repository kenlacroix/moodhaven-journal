import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';

vi.mock('../../stores/booksStore', () => ({
  useBooksStore: () => ({
    books: [],
    activeBookId: null,
    loadBooks: vi.fn(),
    setActiveBook: vi.fn(),
    addBook: vi.fn(),
  }),
}));

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { savingState: string; lastAutoSaved: string | null }) => unknown) =>
    selector({ savingState: 'idle', lastAutoSaved: null }),
}));

vi.mock('../books/NewBookModal', () => ({ NewBookModal: () => null }));
vi.mock('../updater/UpdateBanner', () => ({ UpdateBanner: () => null }));
vi.mock('../peer-sync/PeerSyncBadge', () => ({ PeerSyncBadge: () => null }));

const mockUpdateHook = {
  updateInfo: null,
  isChecking: false,
  checkError: null,
  checkNow: vi.fn(),
  skipVersion: vi.fn(),
  clearSkip: vi.fn(),
};

const defaultProps = {
  currentView: 'writing' as const,
  onNavigate: vi.fn(),
  onLock: vi.fn(),
  onOpenSync: vi.fn(),
  updateHook: mockUpdateHook,
};

describe('Sidebar — support link', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the support link with correct href, target, and rel', () => {
    render(<Sidebar {...defaultProps} />);
    const link = screen.getByTitle('Support MoodHaven Journal');
    expect(link).toHaveAttribute('href', 'https://buymeacoffee.com/moodbloom');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows "Support ♥" text when not collapsed', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Support ♥')).toBeInTheDocument();
  });

  it('hides support text but keeps icon when collapsed', async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);
    const toggleBtn = screen.getByLabelText('Collapse sidebar');
    await user.click(toggleBtn);

    expect(screen.queryByText('Support ♥')).not.toBeInTheDocument();
    const link = screen.getByTitle('Support MoodHaven Journal');
    expect(link.querySelector('svg')).toBeInTheDocument();
  });
});

describe('Sidebar — one-time support prompt', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not show prompt when first_launch_date is less than 30 days ago', () => {
    localStorage.setItem('mb_first_launch_date', new Date().toISOString());
    render(<Sidebar {...defaultProps} />);
    expect(screen.queryByText(/Enjoying MoodHaven Journal/)).not.toBeInTheDocument();
  });

  it('shows prompt when first_launch_date is 30+ days ago', () => {
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    localStorage.setItem('mb_first_launch_date', old);
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText(/Enjoying MoodHaven Journal/)).toBeInTheDocument();
  });

  it('does not show prompt when already dismissed', () => {
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    localStorage.setItem('mb_first_launch_date', old);
    localStorage.setItem('mb_support_prompt_shown', 'true');
    render(<Sidebar {...defaultProps} />);
    expect(screen.queryByText(/Enjoying MoodHaven Journal/)).not.toBeInTheDocument();
  });

  it('dismisses prompt when X button is clicked', async () => {
    const user = userEvent.setup();
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    localStorage.setItem('mb_first_launch_date', old);
    render(<Sidebar {...defaultProps} />);

    await user.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText(/Enjoying MoodHaven Journal/)).not.toBeInTheDocument();
    expect(localStorage.getItem('mb_support_prompt_shown')).toBe('true');
  });

  it('dismisses prompt and sets flag when coffee link in prompt is clicked', async () => {
    const user = userEvent.setup();
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    localStorage.setItem('mb_first_launch_date', old);
    render(<Sidebar {...defaultProps} />);

    const links = screen.getAllByText('Buy Me a Coffee ↗');
    await user.click(links[0]);
    expect(screen.queryByText(/Enjoying MoodHaven Journal/)).not.toBeInTheDocument();
    expect(localStorage.getItem('mb_support_prompt_shown')).toBe('true');
  });

  it('sets first_launch_date on first visit and does not show prompt', () => {
    render(<Sidebar {...defaultProps} />);
    expect(localStorage.getItem('mb_first_launch_date')).not.toBeNull();
    expect(screen.queryByText(/Enjoying MoodHaven Journal/)).not.toBeInTheDocument();
  });
});
