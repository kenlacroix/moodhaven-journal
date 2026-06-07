import { render, screen } from '@testing-library/react';
import { MoodYearHeatmap } from './MoodYearHeatmap';
import type { HeatmapDay } from '../../types/analytics';

// Use a date 30 days ago — guaranteed to be in the heatmap's trailing-365-day window
const d30ago = new Date(Date.now() - 30 * 86400000);
const d30agoStr = d30ago.toISOString().slice(0, 10);
const d60agoStr = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

const mockData: HeatmapDay[] = [
  { date: d30agoStr, averageMood: 4.5, entryCount: 2 },
  { date: d60agoStr, averageMood: 3.0, entryCount: 1 },
];

describe('MoodYearHeatmap', () => {
  it('renders an svg when data is provided', () => {
    const { container } = render(<MoodYearHeatmap data={mockData} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders a loading skeleton when isLoading=true', () => {
    const { container } = render(<MoodYearHeatmap data={[]} isLoading />);
    const rects = container.querySelectorAll('rect.animate-pulse');
    expect(rects.length).toBeGreaterThan(0);
  });

  it('does not render loading skeleton when isLoading=false', () => {
    const { container } = render(<MoodYearHeatmap data={mockData} isLoading={false} />);
    const pulseRects = container.querySelectorAll('rect.animate-pulse');
    expect(pulseRects.length).toBe(0);
  });

  it('renders title elements inside rect cells', () => {
    const { container } = render(<MoodYearHeatmap data={mockData} />);
    // Each cell rect contains a <title> child
    const rects = Array.from(container.querySelectorAll('rect'));
    const titledRects = rects.filter((r) => r.querySelector('title'));
    expect(titledRects.length).toBeGreaterThan(0);
  });

  it('renders a title with mood info for a day with data', () => {
    const { container } = render(<MoodYearHeatmap data={mockData} />);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent ?? '');
    const moodTitle = titles.find((t) => t.includes('mood') && t.includes('4.5'));
    expect(moodTitle).toBeDefined();
  });

  it('renders a "no entries" title for a day without data', () => {
    const { container } = render(<MoodYearHeatmap data={[]} />);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent ?? '');
    expect(titles.some((t) => t.includes('no entries'))).toBe(true);
  });

  it('renders the legend with Low and High labels', () => {
    render(<MoodYearHeatmap data={mockData} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders month labels in the SVG', () => {
    const { container } = render(<MoodYearHeatmap data={mockData} />);
    const textEls = Array.from(container.querySelectorAll('text'));
    const monthTexts = textEls.map((t) => t.textContent);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const found = months.some((m) => monthTexts.includes(m));
    expect(found).toBe(true);
  });

  it('renders day-of-week labels M, W, F', () => {
    const { container } = render(<MoodYearHeatmap data={mockData} />);
    const textEls = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(textEls).toContain('M');
    expect(textEls).toContain('W');
    expect(textEls).toContain('F');
  });

  it('renders an svg with role=img and aria-label', () => {
    const { container } = render(<MoodYearHeatmap data={mockData} />);
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('aria-label')).toBe('Year mood heatmap');
  });
});
