---
name: ui-design
description: Layouts, components, visual hierarchy, grid systems, and design systems for professional web interfaces. Defines rules for grid systems, whitespace, styleguides, design tokens, and UI patterns.
---

# UI Design

> Professional web interfaces through systematic layouts, clear visual hierarchy, and consistent components.

## Scope

Use this skill when: You are creating layouts, designing UI components, establishing visual hierarchy, defining grid systems, building styleguides or design tokens, or auditing existing interfaces for visual consistency.

## Principles

### 1. User-Centered Design Over Aesthetics
Every design decision is guided by the needs of the target audience. An interface that is visually impressive but poorly usable has failed.

### 2. Visual Hierarchy Determines Perception
Size, color, contrast, and position control what users see first. Every page needs exactly ONE primary focal point.

### 3. Consistency Builds Trust
Identical elements must look and behave identically everywhere. Inconsistency increases cognitive load.

### 4. Reduction Is Strength
Every element without a measurable purpose must be removed. Whitespace is not wasted space -- it improves readability and focus.

### 5. The Grid Is the Foundation
Without a grid system, there is no professional layout. The grid enforces alignment, creates rhythm, and enables responsive design.

## Rules

### Layout & Grid

- **DO**: Use a 12-column grid as the basis for desktop (divisible by 2, 3, 4, 6).
- **DO**: Use an 8px baseline grid for all spacing (8, 16, 24, 32, 48, 64px).
- **DO**: Set a maximum content width of 1200-1440px.
- **DON'T**: Mix different grid systems within one application.
- **DON'T**: Place more than 3-4 content blocks side by side on desktop, or more than 1-2 on mobile.

### Visual Hierarchy

- **DO**: Establish at least 3 hierarchy levels: primary (hero), secondary (features), tertiary (details).
- **DO**: Make the most important element at least 1.5x larger than the second most important.
- **DON'T**: Use more than 3 different font sizes within a single viewport area.
- **DON'T**: Place multiple equally weighted CTAs in the same viewport. One primary CTA per viewport.

### Components

- **DO**: Use established UI patterns for standard interactions.
- **DO**: Define clear states for all input elements: default, hover, focus, active, disabled, error.
- **DO**: Include progress indicators for multi-step processes.
- **DON'T**: Invent new interaction patterns for standard tasks.

### Whitespace & Spacing

- **DO**: Use generous whitespace between sections (min. 64-96px vertical on desktop).
- **DO**: Place related elements close together, separate groups far apart (Gestalt law of proximity).
- **DON'T**: Fill empty space with decorative elements.

### Styleguide & Design Tokens

- **DO**: Create a UI styleguide BEFORE implementation: colors, typography, icons, buttons, spacing.
- **DO**: Use design tokens: `--color-primary`, `--spacing-lg`, `--font-heading`.
- **DON'T**: Use magic numbers (hard-coded pixel values) instead of token references.

## Patterns

Detailed pattern descriptions: see `references/patterns.md`

### Hero Section
Large-scale visual + concise headline (max. 7 words) + subline + primary CTA in a contrasting color. Must communicate the core message within 3 seconds.

### Card Layout (Bento Grid)
Modular cards in a grid. Each card is a self-contained information unit. Max. 6-9 cards in the initial viewport on desktop, 2-3 on mobile.

### Split Screen
Two equally weighted halves -- one visual, one textual. Stack vertically on mobile.

### Sticky Navigation
Header remains visible on scroll. Active section is highlighted. Max. height 64px.

### Modals & Overlays
Centered overlay with a dimmed background. Clear close button. Focus trap. Escape closes.

## Anti-Patterns

### Overloaded Interfaces
Too many elements, too little whitespace, competing CTAs. **Solution**: One page = one primary goal.

### Inconsistent Styles
Buttons that look different across pages. **Solution**: Create and enforce a styleguide.

### Dark Patterns
Manipulative design (hidden unsubscribe buttons, confirm shaming). **Solution**: Every interaction must be transparent and in the user's interest.

### Carousel as Content Strategy
Auto-carousels: only slide 1 is noticed (< 1% click rate on slides 2+). **Solution**: Static hero or manual tabs.

### Scroll Hijacking
Overriding native scroll behavior. **Solution**: Preserve native scrolling, keep animations subtle.

## Checklist

- [ ] 12-column grid with 8px baseline defined?
- [ ] Maximum content width set (1200-1440px)?
- [ ] Visual hierarchy verifiable: primary, secondary, tertiary levels?
- [ ] Only ONE primary CTA per viewport?
- [ ] All components have defined states (default, hover, focus, active, disabled, error)?
- [ ] Whitespace between sections consistent and generous (min. 64px)?
- [ ] Styleguide/design tokens in place and applied?
- [ ] No magic numbers -- all values reference tokens?
- [ ] No scroll hijacking or auto-carousel?
- [ ] Dark patterns ruled out?
- [ ] Modals have focus trap and escape-to-close?

## Cross-References

- `web-typography` -- Font selection and sizing for hierarchy
- `color-theory` -- Color systems and contrast rules
- `accessibility` -- WCAG compliance for all UI components
- `usability` -- Heuristics for user-friendliness
- `responsive-design` -- Grid behavior across breakpoints
- `design-trends` -- Current award-winning UI patterns
- `component-patterns` -- Technical component implementation
- `visual-direction` -- Visual direction and style decisions
