import { createEntry } from './services/journalService';
import type { JournalEntryFormData } from '../types/journal';

const SEED_ENTRIES: JournalEntryFormData[] = [
  {
    content: '<p>Good morning. Slept better than expected — woke up before my alarm, which is always a good sign. Coffee is strong, the light outside is nice. Feeling ready to focus today.</p>',
    mood: 4,
    tags: ['morning', 'focus'],
    privacyMode: 0,
  },
  {
    content: '<p>Long day. The afternoon stretched out in the way it does when you have too many browser tabs open and not enough clarity. Got the core thing done though. Dinner helped.</p><p>Need to be better about stepping away from the screen mid-afternoon.</p>',
    mood: 3,
    tags: ['work', 'focus'],
    privacyMode: 0,
  },
  {
    content: '<p>Went for a run this morning for the first time in a while. Legs were not happy. Brain was.</p><p>There\'s something about moving your body before the day starts that resets something. I always forget this and then remember it again the hard way.</p>',
    mood: 4,
    tags: ['health', 'morning'],
    privacyMode: 0,
  },
  {
    content: '<p>Rough day. One of those where nothing goes wrong exactly, but nothing clicks either. I kept second-guessing small decisions and wasting energy.</p><p>Tomorrow I\'ll pick one thing and do that first before anything else.</p>',
    mood: 2,
    tags: ['reflection'],
    privacyMode: 0,
  },
  {
    content: '<p>Had a really good conversation today that reminded me why I do this work. Sometimes you just need someone to reflect things back at you clearly.</p><p>Grateful. Properly.</p>',
    mood: 5,
    tags: ['gratitude', 'people'],
    privacyMode: 0,
  },
];

let seeded = false;

export async function seedDevEntries(): Promise<void> {
  if (seeded) return;
  seeded = true;

  for (const entry of SEED_ENTRIES) {
    try {
      await createEntry(entry);
    } catch {
      // Non-fatal — already-seeded DB or backend unavailable in browser mode
    }
  }
}
