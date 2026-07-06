---
name: responsive-design
description: Mobile-first strategy, breakpoints, fluid layouts, content choreography, and cross-device optimization with CSS Grid, Flexbox, and modern responsive techniques.
---

# Responsive Design

> Start with the smallest viewport and the most important content. Enhance progressively. If it doesn't work at 320px, it has no place at 1920px.

## Scope

Use this skill when you:
- Design a layout for different viewports and devices
- Define or review breakpoints
- Implement mobile-first CSS strategies
- Implement responsive images and media
- Need to ensure touch optimization
- Set up responsive typography

## Principles

### 1. Mobile First, Content First
Start with the smallest viewport and the most important content. Enhance progressively for larger screens.

### 2. Content Determines Breakpoints
Set breakpoints where the design breaks — not at device widths. "Start with the small screen first, then expand until it looks like shit. Time for a breakpoint!" (Stephen Hay).

### 3. Flexibility Over Perfection
Websites don't need to be pixel-perfect. They need to look good and be usable on every device.

### 4. Four Building Blocks
Responsive design consists of flexible layout, media queries, flexible media, and flexible typography.

### 5. Content Choreography
Content adapts not only in size but in arrangement, prioritization, and presentation to match the viewport.

### 6. Progressive Enhancement
Build a solid foundation for all devices and enhance progressively for more capable systems.

## Rules

### DO: Use a Fluid Grid
- USE percentage-based widths instead of fixed pixel values.
- USE CSS Grid for two-dimensional layouts, Flexbox for one-dimensional layouts.
- SET a max-width for the overall container (e.g., 1200-1440px).
- PREFER a 12-column grid system as the starting point.

### DO: Implement Mobile-First in CSS
- WRITE base CSS for the smallest viewport.
- EXTEND with `min-width` media queries for larger screens.
- AVOID `max-width` media queries as the primary strategy (that is desktop-first).

### DO: Implement Responsive Images
- USE `srcset` with at least 3 image sizes (400px, 800px, 1200px).
- USE the `picture` element for art direction.
- SET `width` and `height` attributes to prevent CLS.
- IMPLEMENT `loading="lazy"` for images below the fold.
- COMPRESS in WebP or AVIF.

### DO: Set Breakpoints Thoughtfully
- DEFINE breakpoints based on content, not specific devices.
- Orientation: 320-480px (smartphone), 768px (tablet), 1024px (desktop), 1440px+ (widescreen).
- TEST between breakpoints to ensure the layout remains stable.
- SET a maximum of 4-5 main breakpoints.

### DO: Ensure Touch Optimization
- SIZE touch targets to a minimum of 44x44px.
- MAINTAIN at least 8px spacing between tappable elements.
- REPLACE hover interactions with tap/click alternatives on touch devices.
- AVOID drag-and-drop as the sole interaction method.

### DO: Use Responsive Typography
- USE relative units (rem, em, `clamp()`).
- IMPLEMENT fluid typography with `clamp()` for seamless scaling.
- ADAPT line length to the viewport (optimal: 45-75 characters per line).

### DON'T: Simply Hide Content on Mobile
- DO NOT hide content via `display:none` solely for mobile.
- ADAPT the presentation instead: shorter text, different arrangement, more compact components.

### DON'T: Force Horizontal Scrolling
- ENSURE that no element is wider than the viewport.
- TEST at 320px width as the minimum.
- USE `overflow-x: hidden` only as a last resort.

### DON'T: Use Hamburger Menu on Desktop
- DISPLAY the main navigation visibly on large screens.
- RESERVE the hamburger icon for viewports where the navigation does not fit horizontally.

## Patterns

### Responsive Layout (Fluid Grid)
12-column grid with percentage-based widths. CSS Grid for page structure, Flexbox for component layout. Breakpoints at 768px and 1024px as a minimum. For details and code examples, see `references/fluid-grid.md`.

### Content Choreography
Define the content order per viewport for each page. Mobile shows the most important content first. Desktop uses column layouts for secondary content alongside primary content.

### Card Layout
For equivalent content units (blog posts, products, team members). Cards in a flexible grid that automatically reflows from 3+ columns to 1 column. Each card has an identical structure (image, title, excerpt, CTA).

### Sticky Header with Scroll Behavior
For pages with significant scroll depth: hide the header on scroll down, reveal it on scroll up. On mobile: compact version (logo + hamburger). On desktop: full navigation.

### Responsive Navigation
Full horizontal navigation on desktop. Hamburger icon with slide-in or fullscreen overlay on mobile. Breakpoint where the navigation wraps.

## Anti-Patterns

### Device Targeting Instead of Content Breakpoints
Breakpoints set to exact device widths (375px for iPhone, 768px for iPad). The device landscape is too fragmented. **Solution:** Set breakpoints where the layout breaks.

### Retrofitting Responsive Design onto a Desktop Layout
A desktop design is retrofitted with media queries after the fact. Leads to hidden content and compromised solutions. **Solution:** Think responsive and mobile-first from the start.

### Fixed Pixel Layouts
Column widths and spacing in fixed pixel values. Layout breaks at unexpected viewports. **Solution:** Percentage-based widths, rem/em, `clamp()`.

### Missing Viewport Meta Tag
No `<meta name="viewport" content="width=device-width, initial-scale=1">`. Mobile browsers render at desktop width. **Solution:** Include the viewport meta tag in every HTML document.

## Checklist

### Layout
- [ ] Flexible grid system (12-column or equivalent)
- [ ] Percentage-based column widths, no fixed pixels
- [ ] max-width set for container
- [ ] No horizontal scrolling on any viewport

### Breakpoints
- [ ] Mobile-first approach (min-width media queries)
- [ ] At least 3 breakpoints (mobile, tablet, desktop)
- [ ] Breakpoints determined by content, not devices
- [ ] Layout stable between breakpoints

### Images and Media
- [ ] srcset with at least 3 sizes
- [ ] WebP or AVIF as primary format
- [ ] loading="lazy" below the fold
- [ ] width and height attributes set

### Typography
- [ ] Font sizes in rem or clamp()
- [ ] Line length 45-75 characters across all viewports

### Navigation and Touch
- [ ] Visible navigation on desktop
- [ ] Touch targets at least 44x44px
- [ ] Sufficient spacing between tappable elements

### Performance and Testing
- [ ] Lighthouse mobile score above 90
- [ ] Viewport meta tag present
- [ ] Tested at 320px, 768px, 1024px, 1440px
- [ ] Tested on real devices

## Cross-References

- `usability` -- Usability requirements that must be met responsively
- `navigation-design` -- Responsive navigation in detail
- `images-media` -- Image optimization and responsive image strategies
- `web-typography` -- Responsive typography rules
- `accessibility` -- Touch optimization and mobile accessibility
