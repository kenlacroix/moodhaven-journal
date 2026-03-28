import { render } from '@testing-library/react';
import { CalendarDay } from './CalendarDay';

const baseDate = new Date(2026, 2, 15); // March 15 2026

describe('CalendarDay', () => {
  it('applies scale classes when not selected', () => {
    const { getByRole } = render(
      <CalendarDay
        date={baseDate}
        isCurrentMonth
        isSelected={false}
        onClick={() => {}}
      />
    );
    const btn = getByRole('button');
    expect(btn.className).toContain('hover:scale-[1.08]');
    expect(btn.className).toContain('active:scale-[1.04]');
  });

  it('omits scale classes when selected', () => {
    const { getByRole } = render(
      <CalendarDay
        date={baseDate}
        isCurrentMonth
        isSelected
        onClick={() => {}}
      />
    );
    const btn = getByRole('button');
    expect(btn.className).not.toContain('hover:scale-[1.08]');
    expect(btn.className).not.toContain('active:scale-[1.04]');
  });

  it('shows entry count badge when entry count > 1', () => {
    const { getByText } = render(
      <CalendarDay
        date={baseDate}
        isCurrentMonth
        isSelected={false}
        moodData={{ date: '2026-03-15', averageMood: 4, entryCount: 3 }}
        onClick={() => {}}
      />
    );
    expect(getByText('3')).toBeInTheDocument();
  });
});
