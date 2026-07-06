---
name: web-typography
description: Font selection, font pairing, typographic scales, line height, line length, and CSS implementation for web typography. Defines rules for readable, performant, and hierarchically structured text design.
---

# Web Typography

> Readable, hierarchically structured, and performant text design for the web.

## Scope

Use this skill when: You are selecting fonts, defining font pairings, building typographic scales, setting line heights and line lengths, implementing fluid typography, or auditing existing typography for quality.

## Principles

### 1. Typography Is User Interface
Text is the primary information layer. Typographic design determines whether content is read, scanned, or ignored.

### 2. Readability Before Aesthetics
A font must first be readable. If the user focuses on the formatting instead of the content, the typography has failed.

### 3. Create Hierarchy Through Typography
Different sizes, weights, and styles form a clear information hierarchy. The reading flow is typographically directed.

### 4. Fewer Fonts -- Greater Impact
Maximum 2-3 font families per project. Each additional font increases load time and reduces coherence.

### 5. Use Emotional Impact Intentionally
Sans-serif grotesque = modern/neutral. Serif = classic/trustworthy. Display font = expressive/unique.

## Rules

### Font Selection

- **DO**: Choose fonts matching the brand identity. Corporate: Inter, Geist, DM Sans. Creative: display fonts.
- **DO**: Verify character set coverage: umlauts, special characters (mandatory for German-language content).
- **DO**: Use variable fonts when available (one file instead of 6+).
- **DO**: Prefer self-hosted WOFF2 (GDPR: no Google Fonts CDN).
- **DON'T**: Use more than 2 font families for body + headings. A third only for accents.
- **DON'T**: Use Comic Sans, Papyrus, or Impact in professional contexts -- never.

### Font Pairing

- **DO**: Combine with contrast: serif for headlines + sans for body (or vice versa).
- **DO**: Match similar x-heights between pairs for optical harmony.
- **DO**: Use proven combinations: Playfair Display + Source Sans Pro, Poppins + Inter.
- **DON'T**: Combine two similar sans-serifs. Lack of contrast appears indecisive.

### Sizes & Scale

- **DO**: Use a typographic scale: Major Third (1.250) or Perfect Fourth (1.333).
- **DO**: Body at least 16px (preferably 18px).
- **DO**: Headlines: mobile min. 24px, desktop min. 32px.
- **DO**: Use `clamp()` for fluid responsive sizes: `font-size: clamp(1rem, 2.5vw, 2rem)`.
- **DON'T**: Use font sizes below 14px for readable content. Minimum 12px for footers.

### Line Height & Line Length

- **DO**: Body line-height: 1.5 to 1.75.
- **DO**: Headline line-height: 1.1 to 1.3.
- **DO**: Line length 45-75 characters (optimal: 65). CSS: `max-width: 65ch`.
- **DON'T**: Use line-height 1.0 or below for multi-line text.
- **DON'T**: Let text lines run at full viewport width (readability drops drastically above 80+ characters).

### Text Styling

- **DO**: Use justified text only with hyphenation (`hyphens: auto`).
- **DO**: Prefer ragged right (text-align: left) for web content.
- **DO**: Use `text-wrap: balance` for headlines.
- **DO**: Use `font-weight: 600-700` for emphasis, not underlines or ALL CAPS.
- **DON'T**: Use underlines for text emphasis -- on the web, underline always means "link."
- **DON'T**: Set longer texts in all caps. Only for short labels/buttons (max. 3-4 words).

### Performance

- **DO**: Use WOFF2 format (best compression).
- **DO**: Use `font-display: swap`.
- **DO**: Preload the primary font: `<link rel="preload" href="font.woff2" as="font" type="font/woff2" crossorigin>`.
- **DO**: Subset fonts when only Latin characters are needed (60-80% savings).
- **DON'T**: Load more than 4 font files (including weights).

## Patterns

Detailed pattern descriptions: see `references/patterns.md`

### Typographic Hierarchy (Standard Setup)
H1: 40-56px Bold, H2: 32-40px SemiBold, H3: 24-28px SemiBold, Body: 16-18px Regular, Small: 14px, Eyebrow: 12-14px SemiBold Uppercase.

### Fluid Typography
`clamp()` on all text levels. No media query breakpoints needed for font sizes.

### Editorial Typography
Serif font for body (18-20px). Narrower line length (max 60ch). Drop caps. Pull quotes with display font.

## Anti-Patterns

### Wall of Text
Long running text without structure. **Solution**: Add a subheading every 2-3 paragraphs. Use lists and quotes as rhythm elements.

### Font Overload
More than 3 families, inconsistent weights, arbitrary sizes. **Solution**: 2 families, a defined scale, documented rules.

### Too-Small Font
Body below 16px, especially on mobile. **Solution**: Body min. 16px, on mobile preferably 18px. Test on real devices.

### Insufficient Contrast
Light gray text on a white background. **Solution**: Min. 4.5:1 for body text (WCAG AA). For large headlines (>= 24px): min. 3:1.

## Checklist

- [ ] Max. 2-3 font families?
- [ ] Typographic scale defined and consistently applied?
- [ ] Body at least 16px?
- [ ] Line height body 1.5-1.75, headlines 1.1-1.3?
- [ ] Line length 45-75 characters (ideal 65ch)?
- [ ] Fonts as WOFF2 with `font-display: swap`?
- [ ] Max. 4 font files loaded?
- [ ] Body text contrast at least 4.5:1?
- [ ] No underlines used for text emphasis?
- [ ] No justified text without hyphenation?
- [ ] `clamp()` for responsive sizes?
- [ ] Space before headlines larger than space after headlines?
- [ ] Umlauts and special characters available in the font?
- [ ] Fonts self-hosted (GDPR)?

## Cross-References

- `ui-design` -- Typography as a core element of visual hierarchy
- `color-theory` -- Text color and contrast ratios
- `accessibility` -- WCAG contrast requirements for text
- `responsive-design` -- Fluid typography across breakpoints
- `branding-identity` -- Font as a brand element
- `visual-direction` -- Current typographic trends
