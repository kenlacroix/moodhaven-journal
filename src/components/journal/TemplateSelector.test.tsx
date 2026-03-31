import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateSelector } from './TemplateSelector';
import { JOURNAL_TEMPLATES } from '../../lib/utils/journalTemplates';

describe('TemplateSelector', () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  describe('default (grid) mode', () => {
    it('renders all 7 templates', () => {
      render(<TemplateSelector onSelect={mockOnSelect} />);
      for (const template of JOURNAL_TEMPLATES) {
        expect(screen.getByText(template.name)).toBeInTheDocument();
      }
    });

    it('displays template descriptions', () => {
      render(<TemplateSelector onSelect={mockOnSelect} />);
      for (const template of JOURNAL_TEMPLATES) {
        expect(screen.getByText(template.description)).toBeInTheDocument();
      }
    });

    it('calls onSelect with correct template when clicked', async () => {
      const user = userEvent.setup();
      render(<TemplateSelector onSelect={mockOnSelect} />);

      await user.click(screen.getByText('Gratitude'));
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect.mock.calls[0][0].id).toBe('gratitude');
    });

    it('shows "Choose a template" heading', () => {
      render(<TemplateSelector onSelect={mockOnSelect} />);
      expect(screen.getByText('Choose a template')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('renders all templates', () => {
      render(<TemplateSelector onSelect={mockOnSelect} compact />);
      for (const template of JOURNAL_TEMPLATES) {
        expect(screen.getByText(template.name)).toBeInTheDocument();
      }
    });

    it('does not show descriptions', () => {
      render(<TemplateSelector onSelect={mockOnSelect} compact />);
      // In compact mode, descriptions should not be visible
      for (const template of JOURNAL_TEMPLATES) {
        expect(
          screen.queryByText(template.description)
        ).not.toBeInTheDocument();
      }
    });

    it('does not show heading', () => {
      render(<TemplateSelector onSelect={mockOnSelect} compact />);
      expect(
        screen.queryByText('Choose a template')
      ).not.toBeInTheDocument();
    });
  });

  describe('selection highlight', () => {
    it('renders without error when selectedId matches a template', () => {
      render(
        <TemplateSelector
          onSelect={mockOnSelect}
          selectedId="gratitude"
        />
      );
      expect(screen.getByText('Gratitude')).toBeInTheDocument();
    });

    it('renders without error when selectedId does not match', () => {
      render(
        <TemplateSelector
          onSelect={mockOnSelect}
          selectedId="nonexistent"
        />
      );
      expect(screen.getByText('Gratitude')).toBeInTheDocument();
    });
  });
});
