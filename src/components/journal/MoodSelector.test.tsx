import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoodSelector } from './MoodSelector';
import { MOOD_OPTIONS } from '../../types/journal';

describe('MoodSelector', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('accessibility', () => {
    it('button group has role=group with accessible label', () => {
      render(<MoodSelector value={null} onChange={mockOnChange} />);
      const group = screen.getByRole('group', { name: /how are you feeling/i });
      expect(group).toBeInTheDocument();
    });
  });

  describe('rendering', () => {
    it('renders 5 mood buttons', () => {
      render(<MoodSelector value={null} onChange={mockOnChange} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);
    });

    it('each button has correct aria-label', () => {
      render(<MoodSelector value={null} onChange={mockOnChange} />);
      for (const option of MOOD_OPTIONS) {
        expect(
          screen.getByLabelText(`${option.label} mood`)
        ).toBeInTheDocument();
      }
    });

    it('displays label text for each mood level', () => {
      render(<MoodSelector value={null} onChange={mockOnChange} />);
      for (const option of MOOD_OPTIONS) {
        expect(screen.getByText(option.label)).toBeInTheDocument();
      }
    });
  });

  describe('selection', () => {
    it('calls onChange with correct MoodLevel when clicked', async () => {
      const user = userEvent.setup();
      render(<MoodSelector value={null} onChange={mockOnChange} />);

      await user.click(screen.getByLabelText('Good mood'));
      expect(mockOnChange).toHaveBeenCalledWith(4);
    });

    it('selected button has aria-pressed="true"', () => {
      render(<MoodSelector value={4} onChange={mockOnChange} />);
      expect(screen.getByLabelText('Good mood')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('unselected buttons have aria-pressed="false"', () => {
      render(<MoodSelector value={4} onChange={mockOnChange} />);
      expect(screen.getByLabelText('Struggling mood')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      expect(screen.getByLabelText('Okay mood')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });
  });

  describe('no initial selection', () => {
    it('no button has aria-pressed="true" when value is null', () => {
      render(<MoodSelector value={null} onChange={mockOnChange} />);
      const buttons = screen.getAllByRole('button');
      for (const button of buttons) {
        expect(button).toHaveAttribute('aria-pressed', 'false');
      }
    });
  });

  describe('disabled state', () => {
    it('all buttons are disabled when disabled prop is true', () => {
      render(
        <MoodSelector value={null} onChange={mockOnChange} disabled={true} />
      );
      const buttons = screen.getAllByRole('button');
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
    });

    it('does not call onChange when disabled button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <MoodSelector value={null} onChange={mockOnChange} disabled={true} />
      );
      await user.click(screen.getByLabelText('Good mood'));
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });
});
