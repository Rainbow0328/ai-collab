---
name: ui-patterns
description: Proven, real-world UI interaction patterns from shipped products. Covers hero sections, navigation, cards, pricing, testimonials, CTAs, forms, and footer patterns derived from SiteInspire, CSSDA, Godly, Lapa Ninja, and CSS Winner analysis.
---

# UI-Patterns

> Proven interaction patterns from shipped products. No theory -- real patterns from award-winning sites and successful products.

## Scope

Use this skill when:
- You are designing concrete UI elements (hero, navigation, cards, forms, footer)
- You are structuring landing pages and need conversion-relevant patterns
- You are designing pricing tables, testimonials, or CTAs
- You want to ensure your patterns meet established standards

## Principles

### 1. Patterns Follow Expectations
Users have mental models. A hamburger menu opens navigation; a cart icon leads to checkout. Only break expectations with clear added value.

### 2. Progressive Disclosure
Show only what is relevant in the current context. Reveal details on interaction, not all at once.

### 3. One Primary CTA per Viewport
Each visible area has exactly one primary action. Everything else is secondary or tertiary.

### 4. Consistency over Creativity
Within a product, identical actions must look identical. Creative variation between products, consistency within.

### 5. Mobile-First is Mandatory
Patterns must work at 375px before they are extended to 1440px.

## Rules

### Hero Sections
- **DO**: Choose one of the three proven hero variants:
  - **Statement Hero**: Large headline + subline + CTA. No image. For SaaS/tech.
  - **Split Hero**: Text left, visual right. For products with visual explanation.
  - **Immersive Hero**: Full-screen image/video with overlay text. For brands/portfolios.
- **DO**: Keep the CTA visible above the fold.
- **DO**: Clear visual hierarchy: headline > subline > CTA > secondary elements.
- **DON'T**: Sliders/carousels in the hero. Demonstrably low engagement rates.
- **DON'T**: More than 15 words in the hero headline.
- **DON'T**: Auto-play video with sound.

### Navigation
- **DO**: Choose a proven navigation pattern:
  - **Sticky Top Bar**: Logo left, links center/right, CTA right. Standard for SaaS.
  - **Hamburger Overlay**: Full-screen navigation behind hamburger icon. For creative sites.
  - **Minimal Header**: Logo + hamburger only. For immersive experiences.
- **DO**: Auto-hide on scroll down, reveal on scroll up.
- **DO**: Visually mark the active page in the navigation.
- **DON'T**: More than 7 main navigation items.
- **DON'T**: Mega menus on mobile. Use accordions instead.
- **DON'T**: Navigation without a skip link for keyboard users.

### Card Layouts
- **DO**: Consistent card structure: image top, title, description, meta, CTA bottom.
- **DO**: Make the entire card clickable, not just the CTA text.
- **DO**: Hover states: shadow deepening, slight scale (1.02), image zoom or overlay.
- **DON'T**: Cards without a visual boundary (shadow, border, or background color required).
- **DON'T**: Cards of varying height in a row (exception: intentional masonry).

### Forms
- **DO**: Single-column layout -- higher completion rates.
- **DO**: Inline validation on blur, not only on submit.
- **DO**: Labels above the input field, not as placeholders.
- **DO**: Errors directly at the affected field, not in a summary message.
- **DON'T**: More than 5 fields per visible section.
- **DON'T**: Captchas by default. Use honeypot and rate limiting first.

### CTAs
- **DO**: Filled buttons with contrasting color for primary CTAs.
- **DO**: Action-oriented labels: "Get started", "Try for free", "Book a demo".
- **DO**: Visual feedback: hover state, loading state, success state.
- **DON'T**: More than 2 CTAs side by side.
- **DON'T**: "Submit" or "Click here" as button labels.

Additional rules (pricing, testimonials, footer): see `references/extended-rules.md`

## Patterns

Detailed pattern descriptions: see `references/patterns.md`

| Pattern | Usage | Core Idea |
|---|---|---|
| Feature Showcase Tabs | SaaS landing pages | Horizontal tabs, alternating content |
| Sticky-Section Scroll | Product explanations | Left sticky, right scrolls |
| Marquee Social Proof | B2B SaaS, platforms | Auto-scrolling logo row |
| Command Palette | Power user tools, dashboards | Cmd+K fuzzy matching |
| Mega-Footer Conversion | SaaS, last conversion opportunity | CTA block + classic footer |
| Comparison Table | Competitive differentiation | Column comparison with checkmarks/crosses |
| Onboarding Wizard | Complex products | Multi-step process, max 5 steps |

## Anti-Patterns

1. **Carousel as primary navigation** -- Users rarely interact with slides beyond the first.
2. **Infinite scroll without orientation** -- Without a page end, there is no closure. "Back to top" is mandatory.
3. **Modal on modal** -- Nested modals confuse. Maximum one overlay layer.
4. **Hidden primary CTA** -- When the most important button only becomes visible after scrolling.
5. **Toast notification flood** -- More than one simultaneously is noise. Queue with timeout.
6. **Tooltip as sole explanation** -- Mobile has no hover. Tooltips supplement, they do not replace.
7. **Fake chat widgets** -- Pop-ups that simulate chat but are merely forms.
8. **Dropdown for fewer than 5 options** -- Radio buttons or segmented controls are faster.

## Checklist

- [ ] Hero uses one of the three proven variants (statement, split, immersive)
- [ ] Exactly one primary CTA visible per viewport
- [ ] Navigation has a maximum of 7 main items
- [ ] Active page marked in navigation
- [ ] All cards fully clickable
- [ ] Forms single-column with labels above fields
- [ ] Inline validation on blur implemented
- [ ] Pricing shows 3 options with highlighted recommendation
- [ ] Testimonials with real names, roles, and photos
- [ ] Footer contains legal notice and privacy policy links
- [ ] Mobile navigation as an independent pattern
- [ ] Skip link for keyboard navigation present
- [ ] Loading states for all asynchronous actions
- [ ] Error states for forms and data loading
- [ ] Empty states for lists and dashboards

## Cross-References

- `design-trends` -- Overarching trends that shape these patterns
- `visual-direction` -- Visual execution of patterns (colors, typography, spacing)
- `component-patterns` -- Technical component structure for these patterns
- `agent-ui-design` -- AI-specific UI patterns
- `navigation-design` -- In-depth navigation patterns
- `landing-pages` -- Landing-page-specific pattern application
- `responsive-design` -- Mobile variants of patterns
- `accessibility` -- Accessibility requirements
