---
name: accessibility
description: WCAG conformance, BFSG compliance, semantic HTML, ARIA, keyboard navigation, contrast, forms, and assistive technologies. Defines binding rules for accessible web interfaces per WCAG 2.1 AA.
---

# Accessibility

> Accessible web interfaces are mandatory -- legally, ethically, and commercially.

## Scope

Use this skill when: You are auditing HTML structure and semantics, setting ARIA attributes, implementing keyboard navigation, checking contrasts, designing accessible forms, making media accessible, ensuring BFSG compliance, or auditing existing interfaces for accessibility.

## Principles

### 1. Accessibility Is a Baseline Requirement -- Not a Special Feature
Accessible design benefits EVERYONE. Situational limitations (sunlight, noisy environments, one hand occupied) affect everyone.

### 2. From the Start -- Not Retrofitted
Retrofitting is 10x more expensive and 10x worse. Accessibility belongs in every phase: concept, design, development, testing.

### 3. The Four POUR Principles Are Mandatory
Perceivable, Operable, Understandable, Robust.

### 4. Technology and Design Must Work Together
Not just a developer concern (HTML) and not just a design concern (contrast). Both disciplines in sync.

### 5. Legal Obligation (BFSG Effective June 28, 2025)
The German Accessibility Reinforcement Act (BFSG) requires many companies to provide digital accessibility. It is not optional.

## Rules

### Semantic HTML

- **DO**: Use native elements for their purpose: `<button>` for actions, `<a>` for navigation, `<nav>`, `<main>`, `<article>`.
- **DO**: Maintain a logical heading hierarchy: exactly one `<h1>` per page. Do not skip levels.
- **DO**: Use landmark elements: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`.
- **DON'T**: Use `<div>` or `<span>` for interactive elements. `<div onclick>` is NOT a button.
- **DON'T**: Misuse headings for styling.

### ARIA Attributes

- **DO**: Use ARIA only when no native HTML element fulfills the purpose.
- **DO**: Add `aria-label` to interactive elements without visible text (icon buttons).
- **DO**: Use `aria-live="polite"` for dynamic content (toast notifications).
- **DO**: Use `role="alert"` for error messages.
- **DON'T**: Overload elements with ARIA. Redundant ARIA does harm.
- **DON'T**: Set `aria-hidden="true"` on visible, interactive elements.

### Keyboard Navigation

- **DO**: Make ALL interactive elements reachable via keyboard (Tab, Enter, Space, Escape, Arrow keys).
- **DO**: Provide a visible focus indicator: min. 3:1 contrast, 2-3px outline.
- **DO**: Implement focus trap in modals.
- **DO**: Include a skip-to-content link as the first focusable element.
- **DO**: Ensure tab order matches the visual reading order. Use `tabindex` only with values 0 or -1.
- **DON'T**: Use `tabindex > 0` (breaks natural order).
- **DON'T**: Set `outline: none` without an adequate replacement.

### Contrast & Colors

- **DO**: Normal text: min. **4.5:1** (WCAG AA).
- **DO**: Large text (>= 24px / >= 18.66px bold): min. **3:1**.
- **DO**: UI components: min. **3:1**.
- **DO**: NEVER use color as the only signal. Always provide a second signal: text, icon, pattern.
- **DO**: Test for color vision deficiency (Chrome DevTools > Rendering > Emulate vision deficiencies).
- **DON'T**: Rely on red-green distinctions for critical information (8% of male users affected).

### Images & Media

- **DO**: Informative images: descriptive `alt` text (content, not appearance).
- **DO**: Decorative images: `alt=""` (empty alt text).
- **DO**: Videos with captions. Audio with transcripts.
- **DO**: Make animations pausable. Respect `prefers-reduced-motion` in CSS.
- **DON'T**: Use flashing content (> 3 flashes/second can trigger seizures).

### Forms

- **DO**: Associate every field with a visible `<label>` via `for`/`id`.
- **DO**: Required fields: text + `aria-required="true"`.
- **DO**: Error messages directly at the field + `aria-describedby`.
- **DO**: Use `autocomplete` attributes on standard fields.
- **DON'T**: Use placeholder as a label replacement.
- **DON'T**: Use CAPTCHAs without an accessible alternative.

### Responsive & Touch

- **DO**: Touch targets min. **44x44px** (WCAG), preferably **48x48px**.
- **DO**: Spacing between targets min. **8px**.
- **DO**: Support zoom up to 200% without loss of functionality.
- **DON'T**: Block zooming (`user-scalable=no`, `maximum-scale=1`).

### Motion & Animation

- **DO**: Respect `prefers-reduced-motion`. Reduce or remove animations.
- **DO**: Make automatic motion (carousels, videos) pausable.
- **DON'T**: Use parallax or large motion effects without a `prefers-reduced-motion` fallback.

Detailed pattern descriptions and code examples: see `references/patterns.md`

## Patterns

### Skip Navigation
First focusable link: "Skip to content." Visually hidden, visible on focus. Links to `<main>`.

### Accessible Modal
`role="dialog"` + `aria-modal="true"` + `aria-labelledby`. Focus trap. Escape closes. Focus returns to the trigger.

### Error Summary
Error summary at the top of the form with links to affected fields. `role="alert"`. Additionally inline errors.

### Accessible Accordion
`<button>` as trigger with `aria-expanded`. Content with `aria-labelledby`. Arrow keys for navigation.

## Anti-Patterns

### Div Soup
Everything built from `<div>` and `<span>`. **Solution**: Use native HTML elements.

### Invisible Focus Indicator
`outline: none` without replacement. **Solution**: Visible focus styles with min. 3:1 contrast.

### Placeholder as Label
Fields without `<label>`. **Solution**: Always use a visible label. Placeholder only as supplementary.

### Auto-Playing Media
Autoplay with sound. **Solution**: Start only on user action. Autoplay only muted with pause option.

### ARIA Overload
`role="button"` on a `<button>`. **Solution**: Prefer native HTML. ARIA only as a last resort.

### Zoom Blocking
`maximum-scale=1` in the viewport meta tag. **Solution**: Viewport without zoom restrictions.

## Checklist

### Structure & Semantics
- [ ] Exactly one `<h1>` per page?
- [ ] Heading hierarchy without gaps?
- [ ] Landmark elements present?
- [ ] Skip-to-content link present?
- [ ] No interactive `<div>` / `<span>` elements?

### Contrast & Colors
- [ ] Normal text min. 4.5:1?
- [ ] Large text min. 3:1?
- [ ] UI components min. 3:1?
- [ ] Color never used as the only signal?
- [ ] Color vision deficiency tested?

### Keyboard & Interaction
- [ ] Everything reachable via keyboard?
- [ ] Visible focus indicator?
- [ ] Focus trap in modals?
- [ ] Tab order = visual order?
- [ ] No `tabindex > 0`?

### Images & Media
- [ ] Informative images with `alt` text?
- [ ] Decorative images with `alt=""`?
- [ ] Videos with captions?
- [ ] `prefers-reduced-motion` respected?

### Forms
- [ ] Every field with a visible `<label>`?
- [ ] Required fields marked + `aria-required`?
- [ ] Inline errors with `aria-describedby`?
- [ ] No placeholder as label?

### Mobile & Responsive
- [ ] Touch targets min. 44x44px?
- [ ] Zoom up to 200% possible?

### Legal
- [ ] BFSG relevance assessed?
- [ ] WCAG 2.1 AA as the minimum standard?
- [ ] Accessibility statement present?

## Cross-References

- `ui-design` -- Accessible UI components and states
- `web-typography` -- Readable font sizes and contrast requirements
- `color-theory` -- WCAG contrast requirements, color vision deficiency
- `usability` -- Overlap between accessibility and usability
- `responsive-design` -- Touch targets, zoom, mobile screen readers
- `navigation-design` -- Keyboard navigation, skip links, landmarks
