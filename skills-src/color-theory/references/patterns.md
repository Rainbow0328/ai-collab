# Color Theory -- Patterns (Reference)

## 60-30-10 Rule

**When**: Apply to every color scheme.

**Distribution**:
- **60% dominant color**: Background, large areas (usually white/light gray or dark gray in dark mode)
- **30% secondary color**: Cards, sections, navigation, page areas
- **10% accent color**: CTAs, highlights, interactive elements, links

**Benefit**: Creates visual balance and clear hierarchy without explicit rules.

## Monochromatic Scheme

**When**: Minimalist designs, corporate websites, content-focused pages.

**Implementation**:
- One base color in 5-7 brightness levels
- Example blue: #EFF6FF, #BFDBFE, #60A5FA, #3B82F6, #2563EB, #1E40AF, #1E3A8A
- Accent: a single contrasting color only for CTAs and highlights
- Neutral tones (gray scale) for text and structural elements

**Benefit**: Visually calming, content-focused, hard to get wrong.

## Complementary Contrast

**When**: Energetic, eye-catching designs. E-commerce, promotional pages.

**Implementation**:
- Two opposing colors on the color wheel (e.g., blue + orange)
- IMPORTANT: Never use them equally -- observe the 60-30-10 rule
- The dominant color calms, the accent color activates
- For large areas: use a muted variant of the complementary color

## Analogous Scheme

**When**: Harmonious, natural color worlds. Wellness, nature, lifestyle.

**Implementation**:
- 2-3 adjacent colors on the color wheel (e.g., teal + blue + blue-violet)
- Less contrast than complementary -- but more harmonious
- Choose the accent from outside the analogous range

## Triadic Scheme

**When**: Versatile, dynamic designs. Children's brands, creative, education.

**Implementation**:
- 3 evenly spaced colors on the color wheel (120-degree intervals)
- One color dominates, the other two serve as accents
- Align the saturation of all three colors

## Semantic Color Coding

**When**: Dashboards, forms, systems with status indicators.

**Associations** (established cross-culturally, NOT reinterpretable):

| Meaning | Color | HEX Example | Usage |
|---------|-------|-------------|-------|
| Success | Green | #22C55E | Confirmation, completion, positive status |
| Error | Red | #EF4444 | Error message, invalid input, deletion |
| Warning | Orange | #F59E0B | Notice, action needed, attention |
| Information | Blue | #3B82F6 | Hint, tip, neutral notification |

**Rules**:
- Always provide a second signal alongside color (icon, text)
- Do NOT misuse semantic colors as decorative colors
- Signals must remain recognizable for users with color vision deficiency

## Design Tokens -- Two-Tier System

### Primitive Tokens (Raw Values)
```css
:root {
  --blue-50: #EFF6FF;
  --blue-500: #3B82F6;
  --blue-900: #1E3A8A;
  --red-500: #EF4444;
  --green-500: #22C55E;
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-900: #111827;
}
```

### Semantic Tokens (Meaning)
```css
:root {
  --color-primary: var(--blue-500);
  --color-primary-light: var(--blue-50);
  --color-error: var(--red-500);
  --color-success: var(--green-500);
  --color-bg-page: var(--gray-50);
  --color-bg-surface: white;
  --color-text-primary: var(--gray-900);
  --color-text-secondary: var(--gray-500);
}
```

### Dark Mode Tokens
```css
[data-theme="dark"] {
  --color-bg-page: #121212;
  --color-bg-surface: #1E1E1E;
  --color-text-primary: #E0E0E0;
  --color-text-secondary: #A0A0A0;
  --color-primary: var(--blue-400); /* muted */
}
```

Rule: Use EXCLUSIVELY semantic tokens in component CSS. Never reference primitive values directly.

## Dark Mode -- Independent Scheme

**Rules**:
- Background: #121212 to #1E1E1E (NOT pure black #000)
- Text: #E0E0E0 (NOT pure white #FFF)
- Primary colors: reduce saturation, adjust brightness
- Express elevation through lighter gray levels instead of shadows
- Saturated colors on dark backgrounds appear to "glow" -- tone them down
- Check contrasts separately (different ratios than in light mode)
