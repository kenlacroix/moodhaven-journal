import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TagCloud } from './TagCloud';

describe('TagCloud', () => {
  it('returns null when tags array is empty', () => {
    const { container } = render(
      <TagCloud tags={[]} activeTag={null} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a button for each tag', () => {
    render(
      <TagCloud
        tags={[['work', 3], ['mood', 5]]}
        activeTag={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /work/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mood/i })).toBeInTheDocument();
  });

  it('calls onSelect(tag) when clicking an inactive tag', async () => {
    const onSelect = vi.fn();
    render(
      <TagCloud
        tags={[['work', 1]]}
        activeTag={null}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /work/i }));
    expect(onSelect).toHaveBeenCalledWith('work');
  });

  it('calls onSelect(null) when clicking the active tag (deselect)', async () => {
    const onSelect = vi.fn();
    render(
      <TagCloud
        tags={[['work', 1]]}
        activeTag="work"
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /work/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('applies active styling to the active tag', () => {
    render(
      <TagCloud
        tags={[['active', 2], ['other', 1]]}
        activeTag="active"
        onSelect={vi.fn()}
      />,
    );
    const activeBtn = screen.getByRole('button', { name: /active/i });
    expect(activeBtn.className).toMatch(/bg-violet-500/);
    const otherBtn = screen.getByRole('button', { name: /other/i });
    expect(otherBtn.className).not.toMatch(/bg-violet-500/);
  });
});
