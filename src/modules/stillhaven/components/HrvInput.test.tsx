import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HrvInput } from './HrvInput';

describe('HrvInput', () => {
  it('renders the label', () => {
    render(<HrvInput value={null} onChange={() => {}} />);
    expect(screen.getByLabelText(/hrv/i)).toBeInTheDocument();
  });

  it('shows empty input when value is null', () => {
    render(<HrvInput value={null} onChange={() => {}} />);
    expect(screen.getByRole('spinbutton')).toHaveValue(null);
  });

  it('shows current value', () => {
    render(<HrvInput value={42} onChange={() => {}} />);
    expect(screen.getByRole('spinbutton')).toHaveValue(42);
  });

  it('calls onChange with numeric value on input', async () => {
    const onChange = vi.fn();
    render(<HrvInput value={null} onChange={onChange} />);
    await userEvent.type(screen.getByRole('spinbutton'), '7');
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('calls onChange with null when input cleared', async () => {
    const onChange = vi.fn();
    render(<HrvInput value={42} onChange={onChange} />);
    const input = screen.getByRole('spinbutton');
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
