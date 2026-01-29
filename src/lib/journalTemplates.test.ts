import {
  JOURNAL_TEMPLATES,
  getTemplate,
  formatTemplateContent,
  type JournalTemplate,
} from './journalTemplates';

describe('journalTemplates', () => {
  describe('JOURNAL_TEMPLATES', () => {
    it('contains exactly 7 templates', () => {
      expect(JOURNAL_TEMPLATES).toHaveLength(7);
    });

    it('all templates have required fields', () => {
      for (const template of JOURNAL_TEMPLATES) {
        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(template.emoji).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.color).toBeTruthy();
        expect(Array.isArray(template.prompts)).toBe(true);
      }
    });

    it('all template IDs are unique', () => {
      const ids = JOURNAL_TEMPLATES.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all templates have a valid defaultMood between 1 and 5', () => {
      for (const template of JOURNAL_TEMPLATES) {
        expect(template.defaultMood).toBeGreaterThanOrEqual(1);
        expect(template.defaultMood).toBeLessThanOrEqual(5);
      }
    });

    it('includes expected template IDs', () => {
      const ids = JOURNAL_TEMPLATES.map((t) => t.id);
      expect(ids).toContain('gratitude');
      expect(ids).toContain('happiness');
      expect(ids).toContain('rest');
      expect(ids).toContain('grounding');
      expect(ids).toContain('reflection');
      expect(ids).toContain('goals');
      expect(ids).toContain('freewrite');
    });
  });

  describe('getTemplate', () => {
    it('returns correct template for known ID', () => {
      const template = getTemplate('gratitude');
      expect(template).toBeDefined();
      expect(template!.name).toBe('Gratitude');
    });

    it('returns undefined for unknown ID', () => {
      expect(getTemplate('nonexistent')).toBeUndefined();
    });
  });

  describe('formatTemplateContent', () => {
    it('returns empty string for freewrite template (no prompts)', () => {
      const freewrite = getTemplate('freewrite')!;
      expect(formatTemplateContent(freewrite)).toBe('');
    });

    it('formats prompts with double newlines', () => {
      const gratitude = getTemplate('gratitude')!;
      const content = formatTemplateContent(gratitude);
      expect(content).toContain('Today I am grateful for...');
      expect(content).toContain('\n\n');
    });

    it('includes all prompts from the template', () => {
      const gratitude = getTemplate('gratitude')!;
      const content = formatTemplateContent(gratitude);
      for (const prompt of gratitude.prompts) {
        expect(content).toContain(prompt);
      }
    });
  });
});
