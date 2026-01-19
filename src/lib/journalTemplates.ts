/**
 * Journal Templates
 *
 * Pre-defined templates to help users start journaling with
 * structured prompts and guidance.
 */

export interface JournalTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string; // Tailwind color name
  prompts: string[];
  defaultMood?: number;
}

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  {
    id: 'gratitude',
    name: 'Gratitude',
    emoji: '🙏',
    description: 'Reflect on what you\'re thankful for',
    color: 'amber',
    prompts: [
      'Today I am grateful for...',
      'Something that made me smile today...',
      'A person I appreciate and why...',
    ],
    defaultMood: 4,
  },
  {
    id: 'happiness',
    name: 'Happiness',
    emoji: '😊',
    description: 'Celebrate the good moments',
    color: 'emerald',
    prompts: [
      'The best part of my day was...',
      'Something that brought me joy...',
      'A small win I want to remember...',
    ],
    defaultMood: 5,
  },
  {
    id: 'rest',
    name: 'Rest & Recovery',
    emoji: '😴',
    description: 'Process and unwind',
    color: 'indigo',
    prompts: [
      'Today felt heavy because...',
      'What I need right now is...',
      'Tomorrow, I will be kind to myself by...',
    ],
    defaultMood: 2,
  },
  {
    id: 'grounding',
    name: 'Grounding',
    emoji: '🌿',
    description: 'Center yourself in the present',
    color: 'teal',
    prompts: [
      'Right now, I am feeling...',
      'Five things I can see around me...',
      'One thing I can control today...',
    ],
    defaultMood: 3,
  },
  {
    id: 'reflection',
    name: 'Daily Reflection',
    emoji: '🌅',
    description: 'Review your day mindfully',
    color: 'violet',
    prompts: [
      'How am I feeling right now?',
      'What challenged me today?',
      'What did I learn about myself?',
    ],
    defaultMood: 3,
  },
  {
    id: 'goals',
    name: 'Goals & Dreams',
    emoji: '🎯',
    description: 'Plan and visualize your future',
    color: 'rose',
    prompts: [
      'One thing I want to accomplish...',
      'Steps I can take toward my goal...',
      'What success looks like to me...',
    ],
    defaultMood: 4,
  },
  {
    id: 'freewrite',
    name: 'Free Write',
    emoji: '✨',
    description: 'Write whatever comes to mind',
    color: 'slate',
    prompts: [],
    defaultMood: 3,
  },
];

/**
 * Get a template by ID
 */
export function getTemplate(id: string): JournalTemplate | undefined {
  return JOURNAL_TEMPLATES.find(t => t.id === id);
}

/**
 * Format template prompts into initial content
 */
export function formatTemplateContent(template: JournalTemplate): string {
  if (template.prompts.length === 0) {
    return '';
  }

  return template.prompts.map(prompt => `${prompt}\n\n`).join('');
}
