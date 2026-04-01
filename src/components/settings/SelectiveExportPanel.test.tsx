import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectiveExportPanel } from './SelectiveExportPanel';

describe('SelectiveExportPanel', () => {
  const onExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with no tags when availableTags is empty', () => {
    render(
      <SelectiveExportPanel
        availableTags={[]}
        matchCount={5}
        onExport={onExport}
      />,
    );
    expect(screen.queryByText(/Filter by tags/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('renders tag buttons when availableTags provided', () => {
    render(
      <SelectiveExportPanel
        availableTags={['work', 'personal']}
        matchCount={3}
        onExport={onExport}
      />,
    );
    expect(screen.getByText('#work')).toBeInTheDocument();
    expect(screen.getByText('#personal')).toBeInTheDocument();
  });

  it('toggles tag selection on click', async () => {
    const user = userEvent.setup();
    render(
      <SelectiveExportPanel
        availableTags={['work']}
        matchCount={2}
        onExport={onExport}
      />,
    );
    const workBtn = screen.getByText('#work');
    await user.click(workBtn);
    // clicking Export should pass the tag in filter
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ tags: ['work'] }));
  });

  it('clicking a selected tag deselects it', async () => {
    const user = userEvent.setup();
    render(
      <SelectiveExportPanel
        availableTags={['work']}
        matchCount={2}
        onExport={onExport}
      />,
    );
    const workBtn = screen.getByText('#work');
    await user.click(workBtn); // select
    await user.click(workBtn); // deselect
    await user.click(screen.getByRole('button', { name: 'Export' }));
    // no tags in filter (empty object since no other filters set)
    expect(onExport).toHaveBeenCalledWith({});
  });

  it('shows entry count in preview', () => {
    render(
      <SelectiveExportPanel
        availableTags={[]}
        matchCount={7}
        onExport={onExport}
      />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/entries/)).toBeInTheDocument();
  });

  it('disables Export button when matchCount is 0', () => {
    render(
      <SelectiveExportPanel
        availableTags={[]}
        matchCount={0}
        onExport={onExport}
      />,
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('shows Calculating when matchCount is null', () => {
    render(
      <SelectiveExportPanel
        availableTags={[]}
        matchCount={null}
        onExport={onExport}
      />,
    );
    expect(screen.getByText('Calculating…')).toBeInTheDocument();
  });

  it('disables Export button while isExporting', () => {
    render(
      <SelectiveExportPanel
        availableTags={[]}
        matchCount={3}
        onExport={onExport}
        isExporting
      />,
    );
    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  });
});
