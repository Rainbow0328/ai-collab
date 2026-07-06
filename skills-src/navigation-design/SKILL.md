---
name: navigation-design
description: Menu patterns, breadcrumbs, search functionality, information architecture, and user flow. Navigation as the backbone of every website with accessible implementation.
---

# Navigation Design

> Navigation is the table of contents of a website. It shows users at all times where they are, where they can go, and how to get back.

## Scope

Use this skill when you:
- Design or review a navigation structure
- Select menu patterns for a specific website type
- Design breadcrumbs, meta navigation, or footer navigation
- Integrate a search function
- Translate information architecture into navigation
- Need to ensure accessible navigation

## Principles

### 1. Navigation Is Orientation
Navigation shows users at all times where they are, where they can go, and how to get back. It is the table of contents of the website.

### 2. Information Architecture Before Navigation
Structure the content first, then derive the navigation from it. Never the other way around.

### 3. Clarity Over Creativity
When naming navigation items, clarity takes precedence over originality. Users must be able to predict what lies behind a link.

### 4. Visibility on Large Screens
Never hide the navigation on desktop. The hamburger menu is a mobile pattern, not a universal pattern.

### 5. 3-Click Rule as a Guideline
Users should be able to reach any important information in a maximum of 3 clicks. Not as a dogma, but as a design benchmark.

## Rules

### DO: Structure the Main Navigation Clearly
- LIMIT the main navigation to 5-7 items.
- PLACE the most important links at the beginning and end (Serial Position Effect).
- START with the core offering, end with the primary CTA ("Contact", "Book a Demo").
- USE a horizontal main navigation in the header as the default.

### DO: Use Descriptive Menu Items
- NAME menu items precisely (e.g., "WordPress Tutorials" instead of "Tutorials").
- USE the language of the target audience, not internal jargon.
- INTEGRATE relevant keywords for SEO.

### DO: Offer Multiple Navigation Paths
- COMBINE main navigation, meta navigation, footer navigation, and breadcrumbs.
- PROVIDE a search function starting at approximately 100 subpages.
- USE in-page links within the content area.
- ADD a "back to top" button on long pages.

### DO: Use Meta Navigation
- PLACE meta navigation in the top-right of the header.
- INCLUDE: search function, language selector, login, contact, legal notice.
- KEEP the meta navigation identical across all pages.

### DO: Use the Footer as Supplementary Navigation
- REPEAT the most important links in the footer.
- ADD secondary links (terms & conditions, privacy policy, sitemap, social media).
- GROUP footer links thematically with clear headings.

### DO: Use Breadcrumbs Correctly
- USE breadcrumbs when there are more than 2 hierarchy levels.
- START with a link to the homepage.
- The current page is the last element and is not a link.
- PLACE breadcrumbs directly below the global navigation.

### DO: Implement Accessible Navigation
- ENSURE full keyboard operability.
- IMPLEMENT visible focus indicators.
- USE a logical tab order and skip links.
- SIZE touch targets to a minimum of 44x44px.
- MAINTAIN minimum contrast of 4.5:1 for text, 3:1 for icons.

### DON'T: Use Hamburger Menu on Desktop
- ALWAYS show the full main navigation on large screens.
- DO NOT hide navigation behind icons when sufficient space is available.

### DON'T: Build Overly Deep Hierarchies
- AVOID more than 3 navigation levels.
- LIMIT dropdown menus to 2-3 levels.

### DON'T: Hide Navigation Creatively
- AVOID unconventional navigation positions.
- DO NOT use icons without text labels for primary navigation items.

## Patterns

### Navigation Concept by Website Type

| Website Type | Recommended Navigation |
|---|---|
| Corporate | Horizontal main nav + footer + breadcrumbs |
| E-Commerce | Mega menu + search with filters + breadcrumbs |
| Blog | Main nav + category/tag navigation + pagination |
| Portfolio | Minimalist, category filters, subtle |
| Content Portal | Multi-level + tags + robust search + breadcrumbs |
| One-Page | Scroll navigation + back-to-top button |

### Mega Menu
For e-commerce and large content portals. Full-width dropdown with multi-column layout, maximum 2-3 levels. Visual previews for categories, most important categories on the left (eye-tracking). For details, see `references/navigation-patterns.md`.

### Sidebar Navigation
For web applications, dashboards, documentation sites. Vertical navigation on the left, collapsed to icons only, with full labels on hover/click.

### Scroll Navigation (One-Page)
For portfolio sites, event landing pages. Navigation items scroll to the section, the active item highlights on scroll. "Back to top" button after a defined scroll depth.

### Site Search
Starting at approximately 100 subpages. Search field in the header, highly visible. Autocomplete for large websites. Zero-results page with alternative suggestions.

## Anti-Patterns

### Generic Menu Item Labels
"Services", "Products", "More" without specification. Users cannot predict what to expect. **Solution:** Precise labels: "Web Design Packages", "WordPress Themes".

### Too Many Menu Items
10+ items in the main navigation. Overwhelms users, slows decision-making. **Solution:** Maximum 7 items. Move secondary links to meta navigation or footer.

### Icon-Only Navigation Without Labels
Icons are ambiguous. Not all users know icon conventions. **Solution:** Always combine icons with text labels, at minimum as a tooltip.

### Dropdown on Hover for Touch Devices
Dropdown menus do not work on touch devices. **Solution:** Hover menus with toggle option. First tap opens, second tap navigates.

### Broken Back Button Behavior
Browser back button does not function correctly (SPA routing errors). **Solution:** Implement the History API correctly.

## Checklist

### Structure
- [ ] Information architecture developed before navigation
- [ ] Maximum 5-7 main navigation items
- [ ] Maximum 3 hierarchy levels
- [ ] Most important links at the beginning and end

### Naming
- [ ] Menu items descriptive and in target audience language
- [ ] Keywords integrated into menu items and URLs
- [ ] Consistent naming across all pages

### Elements
- [ ] Logo linked to homepage (top-left)
- [ ] Visible main navigation on desktop
- [ ] Hamburger icon on mobile only
- [ ] Meta navigation present
- [ ] Footer navigation with grouped secondary links
- [ ] Breadcrumbs for more than 2 levels
- [ ] Search function for more than 100 subpages

### Visual Feedback
- [ ] Active menu item visually highlighted
- [ ] Links recognizable as such
- [ ] Visible focus indicator for keyboard navigation

### Accessibility
- [ ] Full keyboard operability
- [ ] Skip links present
- [ ] ARIA labels for navigation regions
- [ ] Minimum contrast of 4.5:1 maintained
- [ ] Touch targets at least 44x44px

## Cross-References

- `usability` -- Navigation as a core usability element
- `responsive-design` -- Responsive navigation (hamburger, breakpoints)
- `accessibility` -- Accessible navigation (WCAG, keyboard, ARIA)
- `ui-design` -- Visual design of navigation elements
- `branding-identity` -- Navigation as a brand touchpoint
