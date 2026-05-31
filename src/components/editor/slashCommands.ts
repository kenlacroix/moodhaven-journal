/**
 * Slash Commands - TipTap extension for "/" command palette
 *
 * Triggers when the user types "/" at the start of a new line.
 * Opens a filterable command menu for inserting block-level elements.
 */

import { Extension } from '@tiptap/core';
import { type Editor } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { SlashCommandMenu } from './SlashCommandMenu';

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  command: (editor: Editor) => void;
}

const slashCommandItems: SlashCommandItem[] = [
  {
    title: 'Heading 2',
    description: 'Large section heading',
    icon: 'H2',
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: 'Bullet List',
    description: 'Unordered list with bullets',
    icon: 'UL',
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    title: 'Numbered List',
    description: 'Ordered list with numbers',
    icon: 'OL',
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    title: 'Task List',
    description: 'Checklist with checkboxes',
    icon: 'TL',
    command: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    title: 'Blockquote',
    description: 'Quote or callout block',
    icon: 'BQ',
    command: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    title: 'Divider',
    description: 'Horizontal separator line',
    icon: 'HR',
    command: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    title: 'Code Block',
    description: 'Fenced code block',
    icon: '<>',
    command: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
];

const renderMenu: SuggestionOptions['render'] = () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  return {
    onStart(props) {
      container = document.createElement('div');
      container.classList.add('slash-command-portal');
      document.body.appendChild(container);
      root = createRoot(container);

      const { clientRect, command, items } = props;
      const rect = clientRect?.();

      root.render(
        createElement(SlashCommandMenu, {
          items: items as SlashCommandItem[],
          onSelect: command,
          rect: rect ?? null,
        })
      );
    },

    onUpdate(props) {
      if (!root) return;

      const { clientRect, command, items } = props;
      const rect = clientRect?.();

      root.render(
        createElement(SlashCommandMenu, {
          items: items as SlashCommandItem[],
          onSelect: command,
          rect: rect ?? null,
        })
      );
    },

    onKeyDown(props) {
      if (props.event.key === 'Escape') {
        if (root && container) {
          root.unmount();
          container.remove();
          root = null;
          container = null;
        }
        return true;
      }

      // Let the SlashCommandMenu handle arrow keys and enter via DOM events
      const menu = document.querySelector('.slash-command-menu');
      if (menu) {
        menu.dispatchEvent(
          new CustomEvent('slash-keydown', { detail: { key: props.event.key } })
        );
        if (['ArrowUp', 'ArrowDown', 'Enter'].includes(props.event.key)) {
          return true;
        }
      }

      return false;
    },

    onExit() {
      if (root && container) {
        root.unmount();
        container.remove();
        root = null;
        container = null;
      }
    },
  };
};

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: true,
        command: ({ editor, range, props }: { editor: Editor; range: { from: number; to: number }; props: SlashCommandItem }) => {
          // Delete the slash and query text
          editor.chain().focus().deleteRange(range).run();
          // Execute the selected command
          props.command(editor);
        },
        items: ({ query }: { query: string }): SlashCommandItem[] => {
          const q = query.toLowerCase();
          return slashCommandItems.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q)
          );
        },
        render: renderMenu,
      } satisfies Partial<SuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
