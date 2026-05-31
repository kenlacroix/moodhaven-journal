# Bundled fonts for the writing-view drawer

These font files are referenced by `@font-face` declarations in
`src/styles/globals.css`. The drawer falls back gracefully if a file is
missing (next entry in the CSS font stack), so the app still works with
an empty directory — but the chosen font won't actually apply.

## Files expected here

| Filename | License | Source | Size (approx) |
|---|---|---|---|
| `source-serif-4-regular.woff2` | OFL 1.1 | https://github.com/adobe-fonts/source-serif (open-source by Adobe; download the woff2 from the latest release) | ~70 KB (Latin subset) |
| `source-serif-4-italic.woff2`  | OFL 1.1 | same | ~70 KB |
| `jetbrains-mono-regular.woff2` | OFL 1.1 | https://www.jetbrains.com/lp/mono/ — official download | ~75 KB |
| `jetbrains-mono-bold.woff2`    | OFL 1.1 | same | ~75 KB |
| `opendyslexic-regular.woff2`   | OFL 1.1 | https://github.com/antijingoist/opendyslexic — `releases` page | ~80 KB |

**Total bundled weight target: ~370 KB** (with the Latin subset rule in
`globals.css` covering `U+0000-00FF, U+2000-206F, U+2070-209F, U+20A0-20CF`).

## Quick install

If you have `woff2_compress` from
[google/woff2](https://github.com/google/woff2) installed, the typical
flow is:

```bash
# Download each font's regular OTF/TTF from the source above, then:
woff2_compress SourceSerif4-Regular.otf
woff2_compress SourceSerif4-Italic.otf
woff2_compress JetBrainsMono-Regular.ttf
woff2_compress JetBrainsMono-Bold.ttf
woff2_compress OpenDyslexic-Regular.otf

# Rename to the filenames in the table above and drop them here.
```

If a downloaded woff2 doesn't have a Latin subset, the
`unicode-range` rule in `globals.css` still limits which glyphs the
browser *uses*, but the file size won't shrink. Consider `pyftsubset`
from `fonttools` if you want true subsetting:

```bash
pyftsubset SourceSerif4-Regular.otf \
  --unicodes="U+0000-00FF,U+2000-206F,U+2070-209F,U+20A0-20CF" \
  --flavor=woff2 \
  --output-file=source-serif-4-regular.woff2
```

## License compliance

All fonts above are SIL Open Font License 1.1. Per OFL:
- Source font names cannot be used in derivative works (we don't modify them).
- The OFL license text travels with redistribution. The license files are
  included in each font's source repository linked above — keep a copy in
  `LICENSES/fonts/` if you mirror the woff2 files into a public bundle.

## Why not Google Fonts?

MoodHaven is local-first. Loading fonts from Google CDN at runtime would
contact Google on every app launch, contradicting the privacy promise.
Bundling means zero network at runtime.

## Iowan Old Style

Not bundled (Apple-licensed). The drawer's "Source Serif" choice tries
`local('Iowan Old Style')` first — Mac users get it for free. Everyone
else gets the bundled Source Serif 4.
