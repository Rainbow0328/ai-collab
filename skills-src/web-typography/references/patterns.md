# Web Typography -- Patterns (Reference)

## Typographic Hierarchy (Standard Setup)

Mandatory for every web project:

| Level | Size | Weight | Line-Height | Notes |
|-------|------|--------|-------------|-------|
| H1 | 40-56px | Bold (700) | 1.1 | Primary font |
| H2 | 32-40px | SemiBold (600) | 1.2 | Primary font |
| H3 | 24-28px | SemiBold (600) | 1.3 | Primary or secondary font |
| Body | 16-18px | Regular (400) | 1.6 | Secondary font |
| Small/Caption | 14px | Regular (400) | 1.5 | Secondary font |
| Eyebrow/Label | 12-14px | SemiBold (600) | 1.5 | Uppercase, `letter-spacing: 0.05em` |

## Typographic Scales

### Major Third (1.250)
Base 16px: 16 / 20 / 25 / 31 / 39 / 49px

### Perfect Fourth (1.333)
Base 16px: 16 / 21 / 28 / 38 / 50 / 67px

### Minor Third (1.200)
Base 16px: 16 / 19 / 23 / 28 / 33 / 40px

Rule: Every size used must be part of the defined scale. No arbitrary intermediate values.

## Fluid Typography

**CSS Implementation**:

```css
:root {
  --font-body: clamp(1rem, 0.5vw + 0.875rem, 1.125rem);
  --font-h3: clamp(1.25rem, 1vw + 1rem, 1.75rem);
  --font-h2: clamp(1.5rem, 2vw + 1rem, 2.5rem);
  --font-h1: clamp(2rem, 3vw + 1rem, 3.5rem);
}
```

**Benefits**:
- No media query breakpoints needed for font sizes
- Smooth transition between mobile and desktop
- One line of CSS per size level

## Editorial Typography

**When**: Blogs, magazines, long-form content.

**Implementation**:
- Serif font for body: Georgia, Lora, Merriweather
- Larger font size: 18-20px
- Narrower line length: max 60ch
- Drop caps for article openings
- Pull quotes with display font
- Generous paragraph spacing

**CSS Drop Cap**:
```css
.article p:first-of-type::first-letter {
  font-size: 3.5em;
  float: left;
  line-height: 0.8;
  margin-right: 0.1em;
  font-family: var(--font-display);
}
```

## Proven Font Pairings

| Headline | Body | Style |
|----------|------|-------|
| Playfair Display | Source Sans Pro | Classic-elegant |
| Merriweather | Open Sans | Editorial |
| Poppins | Inter | Modern-clean |
| DM Serif Display | DM Sans | Harmonious (same family) |
| Fraunces | Work Sans | Creative-professional |

## Spacing & Rhythm

- Paragraph spacing: 1-1.5x the line height
- Space BEFORE headline: larger than space AFTER headline (headline belongs to the following paragraph)
- Letter-spacing uppercase: +0.02em to +0.05em
- Letter-spacing large headlines: -0.01em to -0.02em
- No identical spacing everywhere: vertical rhythm requires hierarchical variation

## Font Loading Strategy

```html
<!-- Preload the primary font -->
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>

<!-- Font face with swap -->
<style>
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}
</style>
```

Rules:
- Load a maximum of 4 font files
- WOFF2 format (best compression)
- Variable fonts when possible (one file for all weights)
- Subsetting for unneeded characters
