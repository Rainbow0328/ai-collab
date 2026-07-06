---
name: usability
description: Heuristic evaluation, conversion optimization, form design, error handling, and usability as a measurable quality criterion per ISO 9241 and Nielsen heuristics.
---

# Usability

> Usability is not a gut feeling — it is a measurable quality criterion. Every interaction must work without cognitive effort.

## Scope

Use this skill when you:
- Evaluate a website or individual pages for usability
- Design or optimize forms
- Design error states and feedback mechanisms
- Conduct a heuristic evaluation based on Nielsen's heuristics
- Aim to increase conversion rates through improved usability
- Need to make content scannable and readable

## Principles

### 1. Don't Make Me Think
Every interaction works without cognitive effort. Users don't read — they scan. Users don't choose optimally — they take the first available path.

### 2. Effectiveness Before Efficiency Before Satisfaction
The three ISO 9241 criteria build upon each other. First, the task must be achievable; then with minimal effort; then with satisfaction.

### 3. Conventions Beat Creativity
Users have learned patterns (logo top-left = homepage, search top-right, shopping cart icon). Only break these with demonstrable justification.

### 4. Aesthetic-Usability Effect
Aesthetically pleasing interfaces are perceived as more usable. Beauty is not a luxury — it is a usability factor.

### 5. Error Tolerance as a Requirement
Users make mistakes. Every interaction must be error-tolerant and provide clear feedback.

### 6. Measurability
Usability is measured through task completion, error rate, task time, and satisfaction scores.

## Rules

### DO: Enforce Consistency
- USE uniform fonts, colors, design elements, and writing conventions across all pages.
- ENSURE that similar page types have identical layouts.
- USE a consistent interaction model (same button styles, same hover effects, same form logic).

### DO: Optimize Above the Fold
- PLACE the most important message, the primary CTA, and a clear headline in the visible area without scrolling.
- AVOID "Welcome" as the first headline. Use benefit-oriented statements instead.

### DO: Keep Forms Minimal
- ASK only for required fields. Every additional field reduces the conversion rate.
- MARK required fields clearly.
- USE clear field labels — never use placeholders as the only labels.
- DISPLAY error messages directly at the affected field.
- PRESERVE correctly filled fields when errors occur.

### DO: Design Error States
- CREATE custom 404 pages with onward navigation.
- PROVIDE clear feedback for every user action (success, error, loading).
- PREVENT auto-playing videos or audio.
- NEVER show empty states without guidance for next steps.

### DO: Make Content Scannable
- STRUCTURE text with subheadings, lists, tables, and visual anchor points.
- LIMIT line lengths to 8-10 words per line.
- USE left-aligned text (no justified text on the web).
- SET body text font size to a minimum of 18px.

### DON'T: Introduce Unnecessary Complexity
- AVOID unnecessary animations, frames, and pop-ups.
- AVOID underlines except for links.
- AVOID generic stock photos with no informational value.
- AVOID hidden or unexpected navigation.

### DON'T: Ignore Load Times
- KEEP load times under 3 seconds.
- USE descriptive URLs.
- OPTIMIZE images and media for fast delivery.

## Patterns

### Heuristic Evaluation (Nielsen)
Systematically evaluate against the 10 usability heuristics: visibility of system status, match between system and real world, user control and freedom, consistency and standards, error prevention, recognition rather than recall, flexibility and efficiency of use, aesthetic and minimalist design, help users recognize and recover from errors, help and documentation. For details, see `references/nielsen-heuristiken.md`.

### Progressive Disclosure
For complex content: show only the essentials first. Offer "Learn more" options for details. Examples: FAQ accordions, expandable product details, multi-step forms.

### Inline Validation
For forms with more than 3 fields: validate inputs immediately on field blur. Show success (green checkmark) and errors (red message with correction suggestion) directly at the field.

### Social Proof for Conversion
On landing pages, product pages, and contact pages: place testimonials, ratings, customer counts, or logos near the CTA. Use real, verifiable statements.

## Anti-Patterns

### Mystery Meat Navigation
Navigation without recognizable links or with cryptic icons lacking labels. Users must guess where a click leads. **Solution:** Clear, descriptive link labels. Always combine icons with text labels.

### Form Overkill
Too many fields, unnecessary required fields, multi-page forms without progress indicators. Each additional field reduces the completion rate by approximately 5-10%. **Solution:** Only necessary fields. Progress bars for multi-step forms.

### Auto-Play Media
Videos or audio start automatically on page visit. **Solution:** Always load media in a paused state. Display the play button prominently.

### False Affordance
Elements look clickable but are not (or vice versa). **Solution:** Buttons look like buttons, links look like links. No decorative elements with interaction styling.

### Endless Scroll Pages Without Orientation
Very long pages without anchor links or a back-to-top button. **Solution:** Table of contents, sticky navigation, back-to-top button after a defined scroll depth.

## Checklist

### Technical
- [ ] Load time under 3 seconds (Lighthouse)
- [ ] Descriptive URLs without cryptic parameters
- [ ] No unnecessary animations or pop-ups
- [ ] Custom 404 page with onward navigation
- [ ] Clear feedback for all user actions
- [ ] Responsive design tested across all breakpoints

### Content and Design
- [ ] Font size at least 18px for body text
- [ ] Sufficient contrast (minimum 4.5:1)
- [ ] Consistent design across all pages
- [ ] Text structured into scannable sections

### Navigation
- [ ] Functional, intuitive main menu
- [ ] Breadcrumbs for more than 2 levels
- [ ] Links consistently styled
- [ ] Logo linked to homepage

### Forms
- [ ] Only necessary fields present
- [ ] Required fields clearly marked
- [ ] Inline error messages directly at the field
- [ ] Correct inputs preserved on error
- [ ] Success confirmation after submission

### Testing
- [ ] Heuristic evaluation against Nielsen's heuristics completed
- [ ] Tested on various devices and browsers
- [ ] A/B testing planned for key conversion elements

## Cross-References

- `ux-design` -- UX design as the overarching discipline
- `accessibility` -- Accessibility as a subset of usability
- `responsive-design` -- Technical prerequisite for cross-device usability
- `navigation-design` -- Navigation as a core usability element
- `web-typography` -- Typography rules for readability
- `landing-pages` -- Conversion optimization on landing pages
