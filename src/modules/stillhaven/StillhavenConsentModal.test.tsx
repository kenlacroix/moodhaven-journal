import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StillhavenConsentModal } from './StillhavenConsentModal';

describe('StillhavenConsentModal', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModal() {
    return render(<StillhavenConsentModal onConfirm={onConfirm} onCancel={onCancel} />);
  }

  it('renders a dialog element', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has aria-modal="true" on the dialog', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-labelledby pointing to the title element', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'stillhaven-consent-title');
    expect(screen.getByRole('heading', { name: 'About StillHaven' })).toHaveAttribute(
      'id',
      'stillhaven-consent-title'
    );
  });

  it('renders the "About StillHaven" heading', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'About StillHaven' })).toBeInTheDocument();
  });

  it('renders the confirm button with correct label', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'I understand, enable StillHaven' })
    ).toBeInTheDocument();
  });

  it('renders the cancel button', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    renderModal();
    await userEvent.click(
      screen.getByRole('button', { name: 'I understand, enable StillHaven' })
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('contains text about bilateral audio stimulation', () => {
    renderModal();
    expect(
      screen.getByText(/StillHaven uses bilateral audio stimulation/i)
    ).toBeInTheDocument();
  });

  it('contains the amber disclaimer about dissociation and flashbacks', () => {
    renderModal();
    expect(
      screen.getByText(/dissociation, flashbacks, or acute/i)
    ).toBeInTheDocument();
  });

  it('mentions that it is not a substitute for a mental health professional', () => {
    renderModal();
    expect(
      screen.getByText(/not a substitute for working with a mental health professional/i)
    ).toBeInTheDocument();
  });

  it('does not call onConfirm or onCancel on initial render', () => {
    renderModal();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
