---
name: visual-direction
description: Current visual direction for web projects covering color palettes, font pairings, layout compositions, and imagery (Q1/Q2 2026). Derived from Dribbble trending, Behance top projects, Land-book curation, and Godly featured sites. Structured for periodic updates.
---

# Visual-Direction

> Current visual direction: color palettes, font pairings, layout compositions, and visual language (as of Q1/Q2 2026). Structured for periodic updates.

## Scope

Use this skill when:
- You are defining a color palette for a new project
- You are selecting font pairings
- You are planning layout compositions and visual rhythms
- You are establishing a consistent visual language
- You are implementing dark/light theming

## Principles

### 1. Color Communicates Brand, Not Trend
Derive palettes from brand identity. Trends inform the framework; the brand determines the execution.

### 2. Typography Sets the Mood
Font choice defines the emotional tone more strongly than any other element. Grotesque = modern, serif = trust, display = creative.

### 3. White Space is Design
Empty space directs the eye, creates hierarchy, and signals premium quality.

### 4. Consistency Beats Creativity
A cohesive visual system looks more professional than sporadic brilliance.

### 5. Contrast Drives Hierarchy
Visual contrast (size, color, weight, space) is the primary tool for information hierarchy.

## Rules

### Color Palettes
- **DO**: Define a structured palette with clear roles:
  - **Primary**: Brand color, used sparingly (CTAs, active states)
  - **Neutral**: Gray gradations (minimum 5 steps)
  - **Semantic**: Success (green), warning (yellow/orange), error (red), info (blue)
  - **Accent**: Optional, for highlights
- **DO**: Deep darks for tech/SaaS: #0A0A0A to #1A1A1A (not #000000).
- **DO**: Warm neutrals for lifestyle/brand: off-whites (#FAFAF5 to #F5F0EB).
- **DO**: Monochrome accents -- one strong color is sufficient.
- **DON'T**: More than 2 chromatic colors in the main palette.
- **DON'T**: Saturated colors on large areas. High saturation only for small accents.
- **DON'T**: Contrast ratio below 4.5:1 for text (WCAG AA).

### Font Pairings
- **DO**: Maximum 2 font families:
  - **Option A**: Geometric grotesque + humanist sans (e.g., Inter + DM Sans)
  - **Option B**: Modern serif + neutral sans (e.g., Fraunces + Inter)
  - **Option C**: Monospace + sans for developer tools (e.g., JetBrains Mono + Inter)
- **DO**: Strong size contrast: display at least 3x larger than body (72-120px vs. 16-18px).
- **DO**: Variable fonts where possible -- one file, many weights.
- **DON'T**: Pair fonts with similar character. Contrast is essential.
- **DON'T**: More than 4 weight levels per typeface.
- **DON'T**: Body text below 16px.

### Layout Composition
- **DO**: Asymmetric balance -- not everything centered.
- **DO**: Generous vertical rhythms: 120-200px section spacing on desktop.
- **DO**: 12- or 16-column grid as a base, then break it deliberately.
- **DO**: Full width for images, constrained (max 720px) for text (65-75 characters per line).
- **DON'T**: Equal columns without variation. 50/50 splits appear static.
- **DON'T**: More than 3 container widths per page.

### Visual Language
- **DO**: Consistent image treatment: same filters, perspective, style.
- **DO**: 3D elements used selectively and subtly.
- **DO**: Brand-specific illustrations (no generic libraries).
- **DO**: Authentic photography with natural lighting.
- **DON'T**: AI-generated images as primary visuals.
- **DON'T**: Uncompressed images. WebP/AVIF with lazy loading.
- **DON'T**: Images without alt text.

Palette archetypes and typography trends: see `references/archetypen.md`

## Patterns

### Dark Mode First
**When:** Tech products, developer tools, premium brands.
**What:** Design starts with dark mode. Light mode is derived. CSS Custom Properties for theme switching.

### Typographic Hero
**When:** Statement landing pages, agency sites, portfolios.
**What:** No image, only typography. 100px+ headline, negative space as a design element.

### Visual Rhythm Section
**When:** Long landing pages with multiple sections.
**What:** Alternating background colors: dark > light > dark. Same palette, different temperature.

### Monochrome + Accent
**When:** Minimalist products, luxury brands.
**What:** Black-and-white/grayscale + a single accent color for CTAs and highlights.

### Oversized Typography Grid
**When:** Portfolios, creative agencies, editorial.
**What:** Large typography as a grid element. Letters break columns; text becomes a visual pattern.

## Anti-Patterns

1. **Trend collage** -- Glassmorphism + neubrutalism + neumorphism on one page. One style per project.
2. **Oversaturated gradients** -- The purple-pink-orange of 2023 looks generic in 2026. Subtle monochrome gradients instead.
3. **Stock photo mix** -- Images from different sources with inconsistent aesthetics.
4. **Font overload** -- 4+ font families appear chaotic.
5. **Icon inconsistency** -- Outlined + filled + duotone mixed. One style, one set.
6. **Shadow overkill** -- Too many levels and directions. 3-5 levels suffice.
7. **Purely decorative elements** -- Shapes without purpose. Every element must support hierarchy or mood.
8. **Contrast poverty** -- Text on images without overlay. Use automated contrast checking.

## Checklist

- [ ] Color palette has defined roles: primary, neutral (5+ steps), semantic, accent
- [ ] All text-background combinations meet WCAG AA (4.5:1)
- [ ] Maximum 2 font families in the project
- [ ] Body text at least 16px
- [ ] Display text at least 3x larger than body
- [ ] Section spacing consistent (e.g., 120px desktop, 64px mobile)
- [ ] Images treated consistently (filter, perspective, style)
- [ ] All images as WebP/AVIF with lazy loading
- [ ] Icon set stylistically uniform
- [ ] Shadow system maximum 5 levels
- [ ] Dark mode implemented or used as primary theme
- [ ] Color system uses CSS Custom Properties
- [ ] No stock photos in hero or feature sections

## Cross-References

- `design-trends` -- Overarching trends shaping this visual direction
- `ui-patterns` -- Patterns designed with this visual direction
- `component-patterns` -- Token system for component theming
- `color-theory` -- Color system fundamentals and token structure
- `web-typography` -- Typography system and scaling
- `branding-identity` -- Brand identity as the foundation of visual direction
- `images-media` -- Image optimization and formats
