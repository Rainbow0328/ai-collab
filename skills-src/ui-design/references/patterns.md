# UI Design -- Patterns (Reference)

## Hero Section

**When**: Homepages, landing pages, product pages.

**Structure**:
- Large-scale visual (image/video/illustration)
- Concise headline: maximum 7 words
- Subline with value proposition
- Primary CTA button in a contrasting color

**Rules**:
- The hero must communicate the core message within 3 seconds
- No second equally weighted CTA in the hero area
- On mobile: stack visual and text vertically

## Card Layout (Bento Grid)

**When**: Feature overviews, portfolios, blog listings, dashboards.

**Structure**:
- Modular cards in a grid
- Each card: self-contained information unit with optional image, title, short text, and CTA
- Cards can have different sizes (bento style) for visual dynamism

**Rules**:
- Max. 6-9 cards in the initial viewport on desktop
- Max. 2-3 cards on mobile
- Consistent inner padding and card height within a row

## Split Screen

**When**: Product showcases, comparisons, storytelling.

**Structure**:
- Two equally weighted halves: one visual (image/video), one textual
- Stack vertically on mobile
- Alternate sides (image left/right) for rhythm across multiple sections

## Sticky Navigation

**When**: Long pages with multiple sections.

**Structure**:
- Header or sub-navigation remains visible on scroll
- Active section is highlighted
- Max. height 64px to avoid encroaching on content area
- On mobile: compact version or hamburger menu

## Modals & Overlays

**When**: Confirming critical actions, detail views, forms.

**Structure**:
- Centered overlay with a dimmed background
- Clear close button (X top right)
- Focus trap for accessibility
- Escape key closes the modal
- Focus returns to the triggering element after closing

## Styleguide Structure

A UI styleguide defines at minimum:
- **Colors**: Primary, secondary, accent, neutrals, semantic (success, warning, error)
- **Typography**: Font families, size scale, weights, line heights
- **Icons**: Style (outline/filled/duotone), sizes, consistency
- **Buttons**: Primary, secondary, tertiary, ghost -- each with all states
- **Spacing**: 8px grid values as a token system
- **Shapes**: Border radius, shadows, dividers

## Design Tokens

Two-tier system:

**Primitive Tokens** (raw values):
```
--blue-500: #3B82F6
--gray-100: #F3F4F6
--spacing-4: 32px
```

**Semantic Tokens** (meaning):
```
--color-primary: var(--blue-500)
--color-bg-surface: var(--gray-100)
--spacing-section: var(--spacing-4)
```

Rule: Use exclusively semantic tokens in component CSS.
