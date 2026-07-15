---
name: color-theory
description: Color models, palettes, contrast, color psychology, color harmonies, and dark mode for web projects. Defines the 60-30-10 rule, semantic color coding, design tokens, and WCAG contrast requirements.
---

# Color Theory

> Systematic color design -- from strategic color selection to accessible dark mode.

## Scope

Use this skill when: You are defining color schemes, building palettes, checking contrasts, designing dark mode, establishing semantic colors, creating design tokens for colors, or auditing existing color concepts for quality.

## Principles

### 1. Colors Are Communication -- Not Decoration
Every color conveys a message. Color selection is a strategic decision.

### 2. Fewer Colors -- Stronger Impact
2-4 colors are sufficient for 95% of all projects. Primary color + accent color + neutral tones.

### 3. Contrast Is Mandatory
Without sufficient contrast, colors are ineffective. Contrast determines readability, hierarchy, and accessibility.

### 4. Consistency Across All Channels
Colors must appear identical everywhere. This requires a defined color system with named tokens.

### 5. Color for Function, Not Just Mood
Colors indicate status (red = error, green = success), signal interactivity, and mark relationships.

## Rules

### Building a Color Scheme

- **DO**: Minimal scheme: 1 primary color + 1 accent color + 3-5 neutral tones.
- **DO**: Create gradations of each color in 9-11 steps (50-950).
- **DO**: Define semantic colors: `success` (green), `warning` (orange), `error` (red), `info` (blue).
- **DO**: Use color harmonies as a starting point: complementary, analogous, or triadic.
- **DON'T**: Use randomly chosen colors. Each one needs justification (brand, function, emotion).
- **DON'T**: Use more than 5 chromatic colors (excluding neutral tones).

### Color Models & Formats

- **DO**: Work internally with HSL (more intuitive for systematic gradations).
- **DO**: Use `oklch()` in modern CSS for perceptually uniform gradations.
- **DON'T**: Use CMYK on the web. CMYK is for print.

### Contrast & Readability

- **DO**: Normal text (< 24px): at least **4.5:1** (WCAG AA).
- **DO**: Large text (>= 24px / >= 18.66px bold): at least **3:1** (WCAG AA).
- **DO**: UI components (icons, borders, focus): at least **3:1**.
- **DO**: Simulate and test for color vision deficiency (protanopia, deuteranopia, tritanopia).
- **DON'T**: Use color as the ONLY differentiator. Always provide a second signal (icon, text, shape).
- **DON'T**: Use light pastel tones on white backgrounds for text or interactive elements.

### Color Psychology & Impact

- **DO**: Choose the primary color to match the industry:
  - Blue: Trust (finance, tech, healthcare)
  - Green: Nature, growth (organic, sustainability)
  - Red: Energy, urgency (food, sales)
  - Black: Premium (luxury, fashion)
  - Orange/Yellow: Optimism (startups, education)
  - Purple: Creativity (creative industries, wellness)
- **DO**: Consider cultural differences for international projects.
- **DON'T**: Work against industry expectations without a deliberate differentiation strategy.

### Dark Mode

- **DO**: Design dark mode as an independent color scheme, not an inversion.
- **DO**: Use muted primary colors (less saturation, medium brightness).
- **DO**: Background: dark gray (#121212 to #1E1E1E), NOT pure black (#000).
- **DO**: Text: #E0E0E0 instead of #FFFFFF.
- **DON'T**: Use saturated bright colors on dark backgrounds -- they "glow."

### Design Tokens

- **DO**: Two-tier system: primitive tokens (`--blue-500`) + semantic tokens (`--color-primary`).
- **DO**: Use exclusively semantic tokens in components.
- **DON'T**: Use HEX values directly in component CSS.

## Patterns

Detailed pattern descriptions: see `references/patterns.md`

### 60-30-10 Rule
60% dominant color (background) + 30% secondary (cards, navigation) + 10% accent (CTAs, highlights).

### Monochromatic Scheme
One color in 5-7 gradations. Accent through a single contrasting color for CTAs.

### Complementary Contrast
Two opposing colors. Never equally weighted -- one dominates (60-30-10).

### Semantic Color Coding
Green = success, red = error, orange = warning, blue = information. These associations are established cross-culturally and are NOT reinterpretable.

## Anti-Patterns

### Rainbow Design
Too many colors without a system. **Solution**: 60-30-10 rule. Max. 5 chromatic colors.

### Color as the Only Signal
Red = error without icon or text. **Solution**: Always provide a redundant signal alongside color.

### Blindly Adopting Trend Colors
Trend color as primary without fit. **Solution**: Use trends as inspiration, brand values as the decision basis.

### Ignoring Contrast Violations
"Looks fine to me" instead of objective verification. **Solution**: Check every combination with a tool (WebAIM, Chrome DevTools).

### Dark Mode as Inversion
Swapping black and white. **Solution**: Independent scheme with adjusted saturation and brightness.

## Checklist

- [ ] Color scheme defined: primary + accent + neutrals + semantic?
- [ ] Max. 5 chromatic colors?
- [ ] 60-30-10 rule applied?
- [ ] All text-background combinations WCAG AA (4.5:1 normal, 3:1 large)?
- [ ] UI component contrast at least 3:1?
- [ ] Color vision deficiency tested?
- [ ] Color never used as the only signal?
- [ ] Design tokens defined (primitive + semantic)?
- [ ] No HEX values directly in components?
- [ ] Dark mode as an independent scheme?
- [ ] Dark mode background #121212-#1E1E1E (not #000)?
- [ ] Color psychology appropriate for the industry?

## Cross-References

- `ui-design` -- Color as a hierarchy tool in layout
- `web-typography` -- Text color and contrast ratios
- `accessibility` -- WCAG contrast requirements in detail
- `branding-identity` -- Color as brand identity
- `visual-direction` -- Current color trends
- `design-trends` -- Color trends from award-winning websites
