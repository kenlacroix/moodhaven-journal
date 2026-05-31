/**
 * transcriptFormatter — Layer 1 rule-based transcript cleanup.
 *
 * Always-on local processing: no network calls, no LLM.
 * Removes filler words, collapses false starts and consecutive repetitions,
 * and inserts paragraph breaks using whisper timestamp gaps.
 */

export interface WhisperSegment {
  text: string;
  start: number; // seconds
  end: number;   // seconds
}

export interface WhisperOutput {
  text: string;
  segments: WhisperSegment[];
}

// ---------------------------------------------------------------------------
// Filler word patterns
// ---------------------------------------------------------------------------

// Standalone fillers — word-boundary match, case-insensitive
const FILLER_PATTERNS = [
  /\b(um|uh|er|hmm)\b/gi,
  // "like" only when standalone (not "I like cats")
  // Match "like" surrounded by spaces / sentence boundaries
  /(?<!\w)(like)(?!\w)/gi,
  // Multi-word fillers
  /\byou know\b/gi,
  /\bi mean\b/gi,
  /\bsort of\b/gi,
  /\bkind of\b/gi,
];

/**
 * Remove filler words from a string.
 */
function removeFillersFromText(text: string): string {
  let result = text;
  for (const pattern of FILLER_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
}

// ---------------------------------------------------------------------------
// False-start collapse
// ---------------------------------------------------------------------------

/**
 * Collapse false starts: if a phrase of up to 3 words is immediately
 * followed by the same phrase, keep only the second occurrence.
 *
 * "I went I went to the store" → "I went to the store"
 */
function collapseFalseStarts(text: string): string {
  // Match repeated phrase of 1–3 words at word boundaries
  return text.replace(
    /\b((\w+)(?:\s+\w+){0,2})\s+\1\b/gi, // eslint-disable-line security/detect-unsafe-regex -- bounded transcript text
    '$1'
  );
}

// ---------------------------------------------------------------------------
// Consecutive word repetition collapse
// ---------------------------------------------------------------------------

/**
 * Collapse consecutive repeated words.
 * "I I I went" → "I went"
 */
function collapseConsecutiveRepetitions(text: string): string {
  // eslint-disable-next-line security/detect-unsafe-regex -- input is bounded transcript text, not arbitrary user content
  return text.replace(/\b(\w+)(\s+\1)+\b/gi, '$1');
}

// ---------------------------------------------------------------------------
// Normalise whitespace
// ---------------------------------------------------------------------------

function normaliseWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Paragraph insertion from timestamp gaps
// ---------------------------------------------------------------------------

const PARAGRAPH_GAP_SECONDS = 2.0;

/**
 * Insert paragraph breaks where whisper segments have a gap > 2.0 seconds.
 * Returns the full text with '\n\n' inserted at those points.
 */
function insertParagraphBreaks(text: string, segments: WhisperSegment[]): string {
  if (segments.length === 0) return text;

  const paragraphParts: string[] = [];
  let currentParagraph = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segText = removeFillersFromText(seg.text);
    currentParagraph += (currentParagraph ? ' ' : '') + segText;

    const nextSeg = segments[i + 1];
    if (nextSeg && (nextSeg.start - seg.end) > PARAGRAPH_GAP_SECONDS) {
      paragraphParts.push(currentParagraph.trim());
      currentParagraph = '';
    }
  }

  if (currentParagraph.trim()) {
    paragraphParts.push(currentParagraph.trim());
  }

  return paragraphParts
    .map((p) => collapseConsecutiveRepetitions(collapseFalseStarts(normaliseWhitespace(p))))
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clean a raw whisper transcript with Layer 1 rule-based processing.
 *
 * - Removes filler words (um, uh, er, hmm, like, you know, I mean, sort of, kind of)
 * - Collapses false starts (repeated phrases of ≤3 words)
 * - Collapses consecutive word repetitions ("I I I went" → "I went")
 * - Inserts paragraph breaks where segment gaps exceed 2.0 seconds
 *   (only when `segments` is provided and non-empty)
 *
 * @param text     Raw transcript text from whisper
 * @param segments Optional whisper segments for paragraph detection
 * @returns        Cleaned text, or empty string if nothing meaningful remains
 */
export function cleanTranscript(text: string, segments?: WhisperSegment[]): string {
  if (!text || !text.trim()) return '';

  let result: string;

  if (segments && segments.length > 0) {
    result = insertParagraphBreaks(text, segments);
  } else {
    // No segments — just clean the flat text
    result = removeFillersFromText(text);
    result = collapseConsecutiveRepetitions(collapseFalseStarts(normaliseWhitespace(result)));
  }

  return result.trim();
}
