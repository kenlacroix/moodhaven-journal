import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityPicker } from './ActivityPicker';
import type { Activity } from '../../types/activities';

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act_exercise',
    name: 'Exercise',
    emoji: '🏃',
    isCustom: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

const baseActivities: Activity[] = [
  makeActivity(),
  makeActivity({ id: 'act_social', name: 'Social', emoji: '👥', sortOrder: 1 }),
  makeActivity({ id: 'act_custom_1', name: 'Yoga', emoji: '🧘', isCustom: true, sortOrder: 99 }),
];

const defaultProps = {
  activities: baseActivities,
  selectedIds: [] as string[],
  onToggle: vi.fn(),
  onCreateCustom: vi.fn(),
  onDeleteCustom: vi.fn(),
  disabled: false,
};

beforeEach(() => vi.clearAllMocks());

describe('ActivityPicker', () => {
  it('renders all activity pills', () => {
    render(<ActivityPicker {...defaultProps} />);
    expect(screen.getByText('Exercise')).toBeInTheDocument();
    expect(screen.getByText('Social')).toBeInTheDocument();
    expect(screen.getByText('Yoga')).toBeInTheDocument();
  });

  it('calls onToggle when a pill is clicked', async () => {
    const user = userEvent.setup();
    render(<ActivityPicker {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add activity: exercise/i }));
    expect(defaultProps.onToggle).toHaveBeenCalledWith('act_exercise');
  });

  it('marks selected activities with aria-pressed true', () => {
    render(<ActivityPicker {...defaultProps} selectedIds={['act_exercise']} />);
    const btn = screen.getByRole('button', { name: /remove activity: exercise/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks unselected activities with aria-pressed false', () => {
    render(<ActivityPicker {...defaultProps} selectedIds={[]} />);
    const btn = screen.getByRole('button', { name: /add activity: exercise/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not call onToggle when disabled', async () => {
    const user = userEvent.setup();
    render(<ActivityPicker {...defaultProps} disabled={true} />);
    const btn = screen.getByRole('button', { name: /activity: exercise/i });
    await user.click(btn);
    expect(defaultProps.onToggle).not.toHaveBeenCalled();
  });

  it('shows add button and opens inline form on click', async () => {
    const user = userEvent.setup();
    render(<ActivityPicker {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add custom activity/i }));
    expect(screen.getByLabelText(/new activity name/i)).toBeInTheDocument();
  });

  it('calls onCreateCustom with name and emoji on submit', async () => {
    const user = userEvent.setup();
    render(<ActivityPicker {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add custom activity/i }));
    const nameInput = screen.getByLabelText(/new activity name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Swimming');
    await user.click(screen.getByRole('button', { name: /save new activity/i }));
    expect(defaultProps.onCreateCustom).toHaveBeenCalledWith('Swimming', expect.any(String));
  });

  it('calls onDeleteCustom when delete button is clicked on custom activity', async () => {
    const user = userEvent.setup();
    render(<ActivityPicker {...defaultProps} />);
    const deleteBtn = screen.getByRole('button', { name: /delete custom activity: yoga/i });
    await user.click(deleteBtn);
    expect(defaultProps.onDeleteCustom).toHaveBeenCalledWith('act_custom_1');
  });

  it('does not render delete button on predefined activities', () => {
    render(<ActivityPicker {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /delete custom activity: exercise/i })).not.toBeInTheDocument();
  });

  it('hides add button when disabled', () => {
    render(<ActivityPicker {...defaultProps} disabled={true} />);
    expect(screen.queryByRole('button', { name: /add custom activity/i })).not.toBeInTheDocument();
  });

  it('renders empty state when no activities provided', () => {
    render(<ActivityPicker {...defaultProps} activities={[]} />);
    expect(screen.queryByRole('button', { name: /activity: exercise/i })).not.toBeInTheDocument();
  });

  it('closes form and clears input on Cancel', async () => {
    const user = userEvent.setup();
    render(<ActivityPicker {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add custom activity/i }));
    await user.type(screen.getByLabelText(/new activity name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /cancel adding activity/i }));
    expect(screen.queryByLabelText(/new activity name/i)).not.toBeInTheDocument();
  });
});
