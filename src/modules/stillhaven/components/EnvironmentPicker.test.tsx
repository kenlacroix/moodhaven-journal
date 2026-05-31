import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnvironmentPicker } from './EnvironmentPicker';
import type { EnvironmentId } from './EnvironmentPicker';

describe('EnvironmentPicker', () => {
  it('renders all three environment options', () => {
    render(<EnvironmentPicker value="underwater" onChange={() => {}} />);
    expect(screen.getByText('Underwater')).toBeInTheDocument();
    expect(screen.getByText('Forest')).toBeInTheDocument();
    expect(screen.getByText('Sky')).toBeInTheDocument();
  });

  it('marks the selected option as pressed', () => {
    render(<EnvironmentPicker value="forest" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Forest/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Underwater/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Sky/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the correct id when an option is clicked', async () => {
    const onChange = vi.fn<(v: EnvironmentId) => void>();
    render(<EnvironmentPicker value="underwater" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Forest/ }));
    expect(onChange).toHaveBeenCalledWith('forest');
  });

  it('calls onChange with sky when sky is clicked', async () => {
    const onChange = vi.fn<(v: EnvironmentId) => void>();
    render(<EnvironmentPicker value="underwater" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Sky/ }));
    expect(onChange).toHaveBeenCalledWith('sky');
  });

  it('does not call onChange when the already-selected option is clicked', async () => {
    const onChange = vi.fn<(v: EnvironmentId) => void>();
    render(<EnvironmentPicker value="underwater" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Underwater/ }));
    expect(onChange).toHaveBeenCalledWith('underwater');
  });

  it('has the testid on the root element', () => {
    render(<EnvironmentPicker value="sky" onChange={() => {}} />);
    expect(screen.getByTestId('environment-picker')).toBeInTheDocument();
  });
});
