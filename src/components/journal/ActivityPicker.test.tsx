import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityPicker } from './ActivityPicker';
import type { Activity } from '../../types/activities';

const predefined: Activity[] = [
  { id: 'act_exercise', name: 'exercise', emoji: '🏃', isCustom: false, sortOrder: 0 },
  { id: 'act_social', name: 'social', emoji: '👥', isCustom: false, sortOrder: 1 },
  { id: 'act_work', name: 'work', emoji: '💼', isCustom: false, sortOrder: 2 },
];

const custom: Activity[] = [
  { id: 'act_custom_1', name: 'yoga', emoji: '🧘', isCustom: true, sortOrder: 1000 },
];

function renderPicker(
  overrides: Partial<Parameters<typeof ActivityPicker>[0]> = {},
) {
  const props = {
    activities: predefined,
    selectedIds: [],
    onChange: vi.fn(),
    onAddCustom: vi.fn(),
    onRemoveCustom: vi.fn(),
    ...overrides,
  };
  return { ...render(<ActivityPicker {...props} />), props };
}

describe('ActivityPicker', () => {
  it('renders all predefined activities as pills', () => {
    renderPicker();
    expect(screen.getByText('exercise')).toBeInTheDocument();
    expect(screen.getByText('social')).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('clicking a pill calls onChange with the added id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ onChange });
    await user.click(screen.getByText('exercise').closest('button')!);
    expect(onChange).toHaveBeenCalledWith(['act_exercise']);
  });

  it('clicking active pill removes its id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ selectedIds: ['act_exercise'], onChange });
    await user.click(screen.getByText('exercise').closest('button')!);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('+ Custom button opens new activity form', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('button', { name: /add custom activity/i }));
    expect(screen.getByPlaceholderText('Activity name')).toBeInTheDocument();
  });

  it('submitting new activity calls onAddCustom', async () => {
    const user = userEvent.setup();
    const onAddCustom = vi.fn().mockResolvedValue({
      id: 'act_custom_x', name: 'hiking', emoji: '🥾', isCustom: true, sortOrder: 999,
    });
    renderPicker({ onAddCustom });
    await user.click(screen.getByRole('button', { name: /add custom activity/i }));
    await user.type(screen.getByPlaceholderText('Activity name'), 'hiking');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAddCustom).toHaveBeenCalledWith('hiking', '✨');
  });

  it('custom activity shows delete (×) button', () => {
    renderPicker({ activities: [...predefined, ...custom] });
    expect(screen.getByRole('button', { name: /delete yoga/i })).toBeInTheDocument();
  });

  it('first click on × shows confirmation, second calls onRemoveCustom', async () => {
    const user = userEvent.setup();
    const onRemoveCustom = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    renderPicker({ activities: [...predefined, ...custom], onRemoveCustom, onChange });

    const deleteBtn = screen.getByRole('button', { name: /delete yoga/i });
    await user.click(deleteBtn);
    // Button text changes to ✓ (confirmation)
    expect(screen.getByRole('button', { name: /confirm delete yoga/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm delete yoga/i }));
    expect(onRemoveCustom).toHaveBeenCalledWith('act_custom_1');
  });

  it('onChange called with updated ids on every selection change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ onChange, activities: predefined });

    await user.click(screen.getByText('exercise').closest('button')!);
    await user.click(screen.getByText('social').closest('button')!);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, ['act_exercise']);
    expect(onChange).toHaveBeenNthCalledWith(2, ['act_social']);
  });

  it('renders loading skeleton when isLoading=true', () => {
    const { container } = renderPicker({ isLoading: true });
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
    expect(screen.queryByText('exercise')).not.toBeInTheDocument();
  });
});
