# Webdesign-Review -- Workflow (Reference)

## Review Process in Detail

### Phase 1: Gather Context

Before the review begins, clarify:
- **Target Audience**: Who are the users? Age, technical affinity, devices?
- **Business Goals**: What should the website achieve? (Leads, sales, information)
- **Industry**: What conventions and expectations apply?
- **Competitors**: Who are the direct competitors?
- **Scope**: Which pages/screens are being reviewed?

### Phase 2: Overall Assessment (5 minutes)

Initial impression WITHOUT checklists:
- First impression in 3 seconds -- what stands out?
- Is the purpose of the page immediately recognizable?
- Does the page appear professional and trustworthy?
- Does the page work on the current device?

### Phase 3: Systematic Domain Analysis

Order by priority:

#### Priority 1 -- Mandatory (always review)
1. **accessibility** -- Accessibility
   - Semantic HTML, contrast, keyboard navigation, ARIA, forms
   - Check BFSG compliance

2. **usability** -- Usability
   - Nielsen heuristics, error handling, consistency

3. **ux-design** -- User Experience
   - User flows, information architecture, feedback loops

#### Priority 2 -- Important (standard review)
4. **ui-design** -- Layout and Components
   - Grid, hierarchy, whitespace, states

5. **web-typography** -- Typography
   - Font selection, scale, line height, line length, performance

6. **color-theory** -- Color Design
   - Schema, contrast, semantics, dark mode

7. **responsive-design** -- Responsiveness
   - Breakpoints, mobile-first, touch targets

8. **navigation-design** -- Navigation
   - Structure, clarity, breadcrumbs, mobile navigation

#### Priority 3 -- Supplementary (deep audit)
9. **images-media** -- Images and Media
10. **branding-identity** -- Brand Consistency
11. **landing-pages** -- Conversion (if landing page)
12. **customer-journey** -- User Journey
13. **component-patterns** -- Component Architecture
14. **ui-patterns** -- Interaction Patterns
15. **visual-direction** -- Visual Direction
16. **design-trends** -- Currency
17. **design-process** -- Process Quality
18. **ai-design-workflow** -- AI Usage
19. **website-audit** -- Technical Quality
20. **agent-ui-design** -- Agent Interfaces

### Phase 4: Consolidate Findings

Structure each finding:

```
## [Domain] -- [Short Title]
**Severity**: Critical | Important | Recommendation
**Rule**: [Reference to the violated rule]
**Finding**: [Description of the issue]
**Solution**: [Concrete improvement suggestion]
```

### Phase 5: Summary

- Name the top 5 priorities
- Highlight critical findings
- Acknowledge positive aspects
- Propose next steps
- Estimate timeline for implementation

## Finding Severity Levels

### Critical (MUST be resolved immediately)
- WCAG violations Level A
- BFSG-relevant deficiencies
- Functional errors (buttons, links, forms broken)
- Security issues
- Content not readable (contrast, font size)

### Important (SHOULD be resolved before launch)
- WCAG violations Level AA
- Usability issues (unclear navigation, missing error handling)
- Inconsistencies in the design system
- Performance deficiencies (> 3s load time)
- Mobile display errors

### Recommendation (CAN be addressed in iterations)
- Best practice improvements
- Stylistic optimizations
- Micro-interactions
- Typographic refinements
- Trend updates

## Report Template

```markdown
# Design Review: [Project Name]
Date: [Date]
Reviewer: [Name]
Scope: [reviewed pages]
Depth: Quick | Standard | Deep

## Summary
[2-3 sentences overall impression]

## Top 5 Priorities
1. [Critical] ...
2. [Critical] ...
3. [Important] ...
4. [Important] ...
5. [Important] ...

## Strengths
- ...

## Findings by Domain
### accessibility
...
### usability
...
[additional domains]

## Next Steps
1. ...
2. ...
3. ...
```
