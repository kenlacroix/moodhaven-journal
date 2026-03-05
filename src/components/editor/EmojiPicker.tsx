/**
 * EmojiPicker - Simple emoji selection panel
 *
 * Per UX spec:
 * - Shows recently used + small selection
 * - No persistent panel
 * - Inserts inline like text
 */

import { useState, useEffect, useRef } from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: { top: number; left: number };
}

// Common emoji categories
const EMOJI_CATEGORIES = {
  recent: [] as string[],
  smileys: ['😊', '😂', '🥰', '😢', '😤', '🤔', '😴', '🥳', '😎', '🤗', '😌', '🙂'],
  nature: ['🌸', '🌺', '🌻', '🍃', '🌙', '⭐', '☀️', '🌈', '🔥', '💧', '❄️', '🌊'],
  activities: ['📝', '💪', '🏃', '🧘', '🎯', '💼', '📚', '🎨', '🎵', '✈️', '🏠', '💤'],
  symbols: ['❤️', '💜', '💙', '💚', '💛', '🧡', '✨', '💫', '🌟', '💯', '✅', '❌'],
};

const STORAGE_KEY = 'moodbloom-recent-emojis';

export function EmojiPicker({ onSelect, onClose, position }: EmojiPickerProps) {
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<keyof typeof EMOJI_CATEGORIES>('smileys');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Load recent emojis
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentEmojis(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleSelect = (emoji: string) => {
    // Update recent emojis
    const updated = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 12);
    setRecentEmojis(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }

    onSelect(emoji);
  };

  const displayEmojis = activeCategory === 'recent' && recentEmojis.length > 0
    ? recentEmojis
    : EMOJI_CATEGORIES[activeCategory === 'recent' ? 'smileys' : activeCategory];

  return (
    <div
      ref={pickerRef}
      className="fixed z-50 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
      style={position ? { top: position.top, left: position.left } : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      {/* Category tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 px-2 pt-2">
        {recentEmojis.length > 0 && (
          <CategoryTab
            label="Recent"
            emoji="🕐"
            isActive={activeCategory === 'recent'}
            onClick={() => setActiveCategory('recent')}
          />
        )}
        <CategoryTab
          label="Smileys"
          emoji="😊"
          isActive={activeCategory === 'smileys'}
          onClick={() => setActiveCategory('smileys')}
        />
        <CategoryTab
          label="Nature"
          emoji="🌸"
          isActive={activeCategory === 'nature'}
          onClick={() => setActiveCategory('nature')}
        />
        <CategoryTab
          label="Activity"
          emoji="📝"
          isActive={activeCategory === 'activities'}
          onClick={() => setActiveCategory('activities')}
        />
        <CategoryTab
          label="Symbols"
          emoji="❤️"
          isActive={activeCategory === 'symbols'}
          onClick={() => setActiveCategory('symbols')}
        />
      </div>

      {/* Emoji grid */}
      <div className="p-3 grid grid-cols-6 gap-1 max-h-48 overflow-auto">
        {displayEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            type="button"
            onClick={() => handleSelect(emoji)}
            className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryTab({
  label,
  emoji,
  isActive,
  onClick,
}: {
  label: string;
  emoji: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 py-2 text-lg rounded-t-lg transition-colors
        ${isActive
          ? 'bg-slate-100 dark:bg-slate-700'
          : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
        }
      `}
      title={label}
    >
      {emoji}
    </button>
  );
}
