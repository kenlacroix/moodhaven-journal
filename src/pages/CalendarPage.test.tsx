vi.mock('../hooks/useCalendar', () => ({ useCalendar: vi.fn() }));
vi.mock('../hooks/usePlatform', () => ({ usePlatform: vi.fn() }));
vi.mock('../components/calendar', () => ({
  CalendarView: ({
    onSelectDate,
    isLoading,
  }: {
    onSelectDate: (d: string) => void;
    isLoading: boolean;
  }) => (
    <div data-testid="calendar-view" data-loading={isLoading}>
      <button onClick={() => onSelectDate('2026-05-15')}>Select date</button>
    </div>
  ),
}));
vi.mock('../components/calendar/DayTimelineView', () => ({
  DayTimelineView: ({
    date,
    onBack,
    onSelectEntry,
  }: {
    date: string;
    onBack?: () => void;
    onSelectEntry: (id: string) => void;
  }) => (
    <div data-testid="day-timeline" data-date={date}>
      {onBack && <button onClick={onBack}>Back</button>}
      <button onClick={() => onSelectEntry('entry-1')}>Select entry</button>
    </div>
  ),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarPage } from './CalendarPage';
import { useCalendar } from '../hooks/useCalendar';
import { usePlatform } from '../hooks/usePlatform';

const mockUseCalendar = vi.mocked(useCalendar);
const mockUsePlatform = vi.mocked(usePlatform);

function makeCalendar(overrides: Partial<ReturnType<typeof useCalendar>> = {}): ReturnType<typeof useCalendar> {
  return {
    year: 2026,
    month: 4,
    monthName: 'May 2026',
    calendarDates: [],
    moodData: new Map(),
    selectedDate: null,
    isLoading: false,
    error: null,
    setSelectedDate: vi.fn(),
    goToPreviousMonth: vi.fn(),
    goToNextMonth: vi.fn(),
    goToToday: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useCalendar>;
}

function setupCalendarMock(initial: Partial<ReturnType<typeof useCalendar>> = {}) {
  let state = makeCalendar(initial);
  const setSelectedDate = vi.fn().mockImplementation((date: string) => {
    state = { ...state, selectedDate: date };
    mockUseCalendar.mockImplementation(() => state);
  });
  state = { ...state, setSelectedDate };
  mockUseCalendar.mockImplementation(() => state);
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePlatform.mockReturnValue({ isAndroid: false, isBrowser: false, isDesktop: true });
  setupCalendarMock();
});

describe('CalendarPage', () => {
  it('renders the calendar grid on desktop', () => {
    render(<CalendarPage />);
    expect(screen.getByTestId('calendar-view')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('does not show timeline pane until a date is selected', () => {
    render(<CalendarPage />);
    expect(screen.queryByTestId('day-timeline')).not.toBeInTheDocument();
  });

  it('shows timeline pane after selecting a date on desktop', () => {
    render(<CalendarPage />);
    fireEvent.click(screen.getByText('Select date'));
    expect(screen.getByTestId('day-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('day-timeline')).toHaveAttribute('data-date', '2026-05-15');
  });

  it('calls onSelectEntry when an entry is chosen from the timeline', () => {
    const onSelectEntry = vi.fn();
    render(<CalendarPage onSelectEntry={onSelectEntry} />);
    fireEvent.click(screen.getByText('Select date'));
    fireEvent.click(screen.getByText('Select entry'));
    expect(onSelectEntry).toHaveBeenCalledWith('entry-1');
  });

  it('shows error banner when calendar.error is set', () => {
    setupCalendarMock({ error: 'Failed to load data' });
    render(<CalendarPage />);
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
  });

  it('renders mobile layout on Android', () => {
    mockUsePlatform.mockReturnValue({ isAndroid: true, isBrowser: false, isDesktop: false });
    setupCalendarMock();
    render(<CalendarPage />);
    expect(screen.getByText('Tap a day to see its entries')).toBeInTheDocument();
  });

  it('shows back button in mobile layout after selecting a date', () => {
    mockUsePlatform.mockReturnValue({ isAndroid: true, isBrowser: false, isDesktop: false });
    setupCalendarMock();
    render(<CalendarPage />);
    fireEvent.click(screen.getByText('Select date'));
    expect(screen.getByTestId('day-timeline')).toBeInTheDocument();
  });
});
