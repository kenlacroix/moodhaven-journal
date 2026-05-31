import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProtocolPicker } from './ProtocolPicker';

describe('ProtocolPicker', () => {
  it('renders both protocol options', () => {
    render(<ProtocolPicker value={null} onChange={() => {}} />);
    expect(screen.getByText('Everyday Settling')).toBeInTheDocument();
    expect(screen.getByText('Heightened State')).toBeInTheDocument();
  });

  it('calls onChange with protocol id on click', async () => {
    const onChange = vi.fn();
    render(<ProtocolPicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByText('Everyday Settling'));
    expect(onChange).toHaveBeenCalledWith('general_activation');
  });

  it('calls onChange with fake_danger on Heightened State click', async () => {
    const onChange = vi.fn();
    render(<ProtocolPicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByText('Heightened State'));
    expect(onChange).toHaveBeenCalledWith('fake_danger');
  });

  it('marks selected protocol button as aria-pressed', () => {
    render(<ProtocolPicker value="general_activation" onChange={() => {}} />);
    const buttons = screen.getAllByRole('button');
    const generalBtn = buttons.find((b) => b.textContent?.includes('Everyday Settling'));
    const dangerBtn = buttons.find((b) => b.textContent?.includes('Heightened State'));
    expect(generalBtn).toHaveAttribute('aria-pressed', 'true');
    expect(dangerBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows hint count when hints provided', () => {
    const hints = { general_activation: { count: 3, avgDelta: 2.5 } };
    render(<ProtocolPicker value={null} onChange={() => {}} hints={hints} />);
    expect(screen.getByText(/3× this week/)).toBeInTheDocument();
    expect(screen.getByText(/avg −2\.5/)).toBeInTheDocument();
  });

  it('does not show hint when count is 0', () => {
    const hints = { general_activation: { count: 0, avgDelta: null } };
    render(<ProtocolPicker value={null} onChange={() => {}} hints={hints} />);
    expect(screen.queryByText(/this week/)).not.toBeInTheDocument();
  });

  it('shows hint without avg when avgDelta is null or 0', () => {
    const hints = { fake_danger: { count: 2, avgDelta: null } };
    render(<ProtocolPicker value={null} onChange={() => {}} hints={hints} />);
    expect(screen.getByText(/2× this week/)).toBeInTheDocument();
    expect(screen.queryByText(/avg/)).not.toBeInTheDocument();
  });
});
