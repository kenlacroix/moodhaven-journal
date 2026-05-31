import {
  FONT_OPTIONS,
  SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  PARAGRAPH_SPACING_OPTIONS,
  TINT_OPTIONS,
  WIDTH_OPTIONS,
  clampTextScale,
  createDefaultWritingAppearance,
  type FontChoice,
  type TintChoice,
} from './writingAppearance';

describe('writingAppearance', () => {
  describe('option arrays', () => {
    it('FONT_OPTIONS values are unique', () => {
      const values = FONT_OPTIONS.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    });

    it('every FONT_OPTION has a preview string', () => {
      for (const opt of FONT_OPTIONS) {
        expect(opt.preview.length).toBeGreaterThan(0);
      }
    });

    it('every FONT_OPTION has a font-family stack', () => {
      for (const opt of FONT_OPTIONS) {
        expect(opt.stack.length).toBeGreaterThan(0);
      }
    });

    it('TINT_OPTIONS values are unique and hexes are 7-char', () => {
      const values = TINT_OPTIONS.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
      for (const opt of TINT_OPTIONS) {
        expect(opt.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it('cream tint matches the brand cream from DESIGN.md', () => {
      const cream = TINT_OPTIONS.find((o) => o.value === 'cream');
      expect(cream?.hex).toBe('#F3F0EA');
    });

    it('SIZE_OPTIONS, LINE_HEIGHT_OPTIONS, PARAGRAPH_SPACING_OPTIONS, WIDTH_OPTIONS each have at least 3 entries', () => {
      expect(SIZE_OPTIONS.length).toBeGreaterThanOrEqual(3);
      expect(LINE_HEIGHT_OPTIONS.length).toBeGreaterThanOrEqual(3);
      expect(PARAGRAPH_SPACING_OPTIONS.length).toBeGreaterThanOrEqual(3);
      expect(WIDTH_OPTIONS.length).toBeGreaterThanOrEqual(3);
    });

    it('WIDTH_OPTIONS px values are monotonically increasing', () => {
      for (let i = 1; i < WIDTH_OPTIONS.length; i++) {
        expect(WIDTH_OPTIONS[i].px).toBeGreaterThan(WIDTH_OPTIONS[i - 1].px);
      }
    });

    it('OpenDyslexic is in FONT_OPTIONS — a11y requirement', () => {
      const found = FONT_OPTIONS.find((o) => o.value === 'opendyslexic');
      expect(found).toBeDefined();
    });
  });

  describe('clampTextScale', () => {
    it('clamps values above 2.0', () => {
      expect(clampTextScale(3)).toBe(2.0);
      expect(clampTextScale(99)).toBe(2.0);
    });

    it('clamps values below 0.8', () => {
      expect(clampTextScale(0.5)).toBe(0.8);
      expect(clampTextScale(-1)).toBe(0.8);
    });

    it('passes values in range through unchanged', () => {
      expect(clampTextScale(1.0)).toBe(1.0);
      expect(clampTextScale(1.5)).toBe(1.5);
      expect(clampTextScale(0.8)).toBe(0.8);
      expect(clampTextScale(2.0)).toBe(2.0);
    });

    it('falls back to 1.0 on NaN', () => {
      expect(clampTextScale(NaN)).toBe(1.0);
    });
  });

  describe('createDefaultWritingAppearance', () => {
    it('returns sane defaults that match a valid choice for each axis', () => {
      const d = createDefaultWritingAppearance();
      const fontValues = FONT_OPTIONS.map((o) => o.value) as FontChoice[];
      const tintValues = TINT_OPTIONS.map((o) => o.value) as TintChoice[];
      expect(fontValues).toContain(d.fontFamily);
      expect(tintValues).toContain(d.backgroundTint);
      expect(d.textScale).toBe(1.0);
      expect(d.focusMode).toBe(false);
      expect(d.highContrast).toBe(false);
      expect(d.dyslexiaProfile).toBe(false);
      expect(d.reducedMotion).toBe('auto');
    });

    it('default tint is brand cream', () => {
      expect(createDefaultWritingAppearance().backgroundTint).toBe('cream');
    });
  });
});
