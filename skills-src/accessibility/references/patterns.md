# Accessibility -- Patterns (Reference)

## Skip Navigation

**When**: Every multi-page website.

**HTML**:
```html
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <header>...</header>
  <nav>...</nav>
  <main id="main-content">...</main>
</body>
```

**CSS**:
```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  padding: 0.75rem 1.5rem;
  background: var(--color-primary);
  color: white;
  z-index: 1000;
}
.skip-link:focus {
  top: 0;
}
```

## Accessible Modal

**When**: Dialogs, confirmations, forms in overlays.

**HTML**:
```html
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Confirmation</h2>
  <p>Do you want to delete this entry?</p>
  <button>Delete</button>
  <button>Cancel</button>
</div>
```

**Rules**:
- Focus trap: Tab stays within the modal
- Escape closes the modal
- Focus returns to the triggering element after closing
- Background receives `aria-hidden="true"` while the modal is open
- The first focusable button or the modal itself receives initial focus

## Error Summary

**When**: Form validation.

**HTML**:
```html
<div role="alert" aria-labelledby="error-heading">
  <h2 id="error-heading">3 errors found</h2>
  <ul>
    <li><a href="#email">Email address is invalid</a></li>
    <li><a href="#password">Password must be at least 8 characters</a></li>
    <li><a href="#terms">Terms and conditions must be accepted</a></li>
  </ul>
</div>

<!-- Inline error at the field -->
<div class="field">
  <label for="email">Email</label>
  <input id="email" type="email" aria-describedby="email-error" aria-invalid="true">
  <span id="email-error" class="error">Email address is invalid</span>
</div>
```

## Accessible Accordion

**When**: FAQ sections, long content lists.

**HTML**:
```html
<div class="accordion">
  <h3>
    <button aria-expanded="false" aria-controls="panel-1" id="trigger-1">
      How can I reset my password?
    </button>
  </h3>
  <div id="panel-1" role="region" aria-labelledby="trigger-1" hidden>
    <p>Click "Forgot password" on the login page...</p>
  </div>
</div>
```

**Keyboard Interaction**:
- Enter/Space: Open/close panel
- Arrow keys: Navigate between accordion triggers
- Home/End: Jump to first/last trigger

## Responsive Tables

**When**: Tabular data on mobile.

**Variant 1 -- Horizontal Scrolling**:
```html
<div style="overflow-x: auto;" role="region" aria-label="Price list" tabindex="0">
  <table>...</table>
</div>
```

**Variant 2 -- Card Layout on Mobile**:
```css
@media (max-width: 768px) {
  table, thead, tbody, tr, td { display: block; }
  thead { position: absolute; clip: rect(0 0 0 0); }
  td::before {
    content: attr(data-label);
    font-weight: 600;
    display: block;
  }
}
```

## Accessible Icon Button

```html
<button aria-label="Open menu">
  <svg aria-hidden="true" ...><!-- Hamburger Icon --></svg>
</button>
```

Rules:
- `aria-label` describes the action, not the icon
- SVG receives `aria-hidden="true"` (redundant with the label)
- Minimum size 44x44px touch target

## prefers-reduced-motion

```css
/* Default: with animations */
.element {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

/* User prefers reduced motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Focus Indicator

```css
/* Visible focus indicator for all interactive elements */
:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Show focus only on keyboard navigation */
:focus:not(:focus-visible) {
  outline: none;
}
```

Rules:
- Minimum contrast of the outline: 3:1 against the background
- `outline-offset` for visual spacing from the element
- `:focus-visible` instead of `:focus` for keyboard-specific display

## BFSG/WCAG Compliance Checklist (Quick Reference)

| Criterion | Level | Test Method |
|-----------|-------|------------|
| Text alternatives | A | Alt text audit |
| Contrast 4.5:1 | AA | Contrast checker |
| Contrast 3:1 (large) | AA | Contrast checker |
| Keyboard access | A | Tab-through test |
| Focus visible | AA | Visual inspection |
| Heading hierarchy | A | DOM inspection |
| Labels present | A | Form audit |
| Zoom 200% | AA | Browser zoom test |
| prefers-reduced-motion | AAA | CSS audit |
| ARIA correct | A | Screen reader test |
