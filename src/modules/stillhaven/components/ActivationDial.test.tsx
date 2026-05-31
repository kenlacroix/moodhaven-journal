import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivationDial } from './ActivationDial';

describe('ActivationDial', () => {
  it('renders 10 buttons labelled 1–10', () => {
    render(<ActivationDial value={null} onChange={() => {}} />);
    for (let n = 1; n <= 10; n++) {
      expect(screen.getByRole('button', { name: `Activation level ${n}` })).toBeInTheDocument();
    }
  });

  it('calls onChange with the clicked level', async () => {
    const onChange = vi.fn();
    render(<ActivationDial value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Activation level 5' }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('marks selected button as aria-pressed', () => {
    render(<ActivationDial value={7} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Activation level 7' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Activation level 3' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders custom label', () => {
    render(<ActivationDial value={null} onChange={() => {}} label="How tense?" />);
    expect(screen.getByText('How tense?')).toBeInTheDocument();
  });

  it('shows calm and overwhelmed scale labels', () => {
    render(<ActivationDial value={null} onChange={() => {}} />);
    expect(screen.getByText('calm')).toBeInTheDocument();
    expect(screen.getByText('overwhelmed')).toBeInTheDocument();
  });

  it('no button has aria-pressed true when value is null', () => {
    render(<ActivationDial value={null} onChange={() => {}} />);
    const pressedButtons = screen.getAllByRole('button').filter(
      (b) => b.getAttribute('aria-pressed') === 'true'
    );
    expect(pressedButtons).toHaveLength(0);
  });
});
