# Design-Trends: Pattern Reference

> Detailed descriptions of current design patterns (Q1/Q2 2026).

## Immersive Hero

**When:** Landing pages, portfolios, brand sites.
**What:** Full-screen hero with large typography, subtle animation, and a single CTA. No visual noise.
**Reference:** SOM Power (CSSDA 8.56), Detroit Paris (8.41).
**Implementation:**
- Viewport-filling container with overflow: hidden
- Headline 80-120px, variable font, animated on entrance
- Single CTA button with micro-animation
- Background image/video with object-fit: cover and prefers-reduced-motion fallback

## Scroll Storytelling

**When:** Product launches, case studies, brand narratives.
**What:** Sequential sections activated by scrolling. Each section reveals content progressively. Animations tied to scroll position.
**Implementation:**
- ScrollTimeline API or IntersectionObserver with threshold arrays
- Pinned sections with position: sticky for narrative beats
- Progress indicator on the page margin

## Bento Grid Dashboard

**When:** Feature overviews, SaaS landing pages, product highlights.
**What:** Unevenly sized cards in a grid arrangement. Large card for the main feature, smaller cards for secondary features.
**Reference:** Vercel Ship, Notion.
**Implementation:**
- CSS Grid with grid-template-areas or span values
- Hover effect: slight scale (1.02) + shadow deepening
- Responsive: 1 column on mobile, 2-3 columns on tablet, full grid on desktop

## Dark Canvas

**When:** Tech products, developer tools, premium brands.
**What:** Dark background (#0a0a0a to #1a1a1a), light typography, colored accents only for CTAs and active states.
**Reference:** Godly featured sites majority.
**Implementation:**
- Background: var(--color-surface-dark) with CSS Custom Properties
- Text: #FAFAFA or #E5E5E5
- Accent color only on CTAs, active states, and badges
- Subtle grain texture (2-5% opacity) for depth

## Editorial Scroll

**When:** Magazines, blogs, content-rich sites.
**What:** Generous white space, typographic hierarchy, alternating image-text flow in a vertical rhythm.
**Reference:** SiteInspire category "Typographic" (2,052 sites).

## Magnetic Interaction

**When:** Portfolios, creative agencies, experimental sites.
**What:** Elements that react to mouse movement -- magnetic buttons, cursor following, parallax on hover.
**Reference:** Awwwards nominees such as Studio X, Ibrahem Ghareib.
**Implementation:**
- Track mouse position relative to the element
- Transform with translate3d for GPU acceleration
- Spring-like return with cubic-bezier or spring physics
- Touch fallback: no magnetic effect on mobile

## Kinetic Typography

**When:** Brand sites, event pages, creative portfolios.
**What:** Animated typography on scroll or mouse movement. Letters that dissolve, rotate, or transform.
**Reference:** CSSDA winners Darknode (8.38), The Cosmic Stage (8.11).

## Horizontal Scroll Gallery

**When:** Portfolio showcases, product galleries, case study presentations.
**What:** Horizontal scroll area within a vertical page. Mousewheel mapped to horizontal movement.
**Reference:** Godly featured sites Christopher Ireland, Pedro Duarte.

## AI-Native Interface

**When:** SaaS products with AI features, agent applications, productivity tools.
**What:** Chat interface as primary interaction alongside or instead of traditional UI. Command palette (Cmd+K) as entry point to AI functionality.
**Reference:** Behance lifeOS AI Agents, Dribbble dashboard designs.

## Micro-Animation System

**When:** Every professional web application.
**What:** Systematic micro-animations for all state transitions as a motion token system:
- `duration.fast`: 150ms (hover, focus)
- `duration.normal`: 300ms (open, close)
- `duration.slow`: 500ms (page transitions)
- Easing curves defined as design tokens

## Sources

- **Awwwards** -- SOTD April 2026, 40+ sites analyzed
- **CSSDA** -- WOTD March/April 2026 with JPANEL scores (6.2-8.6), 80+ sites
- **CSS Winner** -- SOTD with Design/Functionality/Usability/Content scores
- **Godly** -- 80+ featured sites including Lusion, Amie, Vercel Ship, Notion, Metalab
- **SiteInspire** -- Categories: Agencies (2,185), Typographic (2,052), Portfolio (1,291)
