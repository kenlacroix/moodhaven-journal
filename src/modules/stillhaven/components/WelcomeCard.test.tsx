import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeCard } from './WelcomeCard';

describe('WelcomeCard', () => {
  it('renders the main heading', () => {
    render(<WelcomeCard onBegin={() => {}} />);
    expect(screen.getByRole('heading', { name: /when your body won't settle/i })).toBeInTheDocument();
  });

  it('renders the begin button', () => {
    render(<WelcomeCard onBegin={() => {}} />);
    expect(screen.getByRole('button', { name: /got it, let's begin/i })).toBeInTheDocument();
  });

  it('calls onBegin when begin button clicked', async () => {
    const onBegin = vi.fn();
    render(<WelcomeCard onBegin={onBegin} />);
    await userEvent.click(screen.getByRole('button', { name: /got it, let's begin/i }));
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it('shows wellness disclaimer', () => {
    render(<WelcomeCard onBegin={() => {}} />);
    expect(screen.getByText(/wellness tool, not a medical device/i)).toBeInTheDocument();
  });

  it('shows the how it works section', () => {
    render(<WelcomeCard onBegin={() => {}} />);
    expect(screen.getByText(/How it works/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose a session type/i)).toBeInTheDocument();
  });
});
