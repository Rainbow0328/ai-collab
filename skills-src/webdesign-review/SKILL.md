---
name: webdesign-review
description: Meta-skill for comprehensive web design reviews. Orchestrates all 20 domain skills for systematic analysis of websites, designs, and prototypes against enterprise design standards.
---

# Webdesign-Review

> Systematic design reviews through orchestrated application of all domain skills.

## Scope

Use this skill when: You are conducting a comprehensive design review of a website, prototype, or design. This meta-skill coordinates the analysis across all relevant design domains and ensures that no dimension is overlooked.

## Principles

### 1. Rigor Over Gut Feeling
A design review follows a defined structure, not personal preferences. Every assessment must be substantiated by a specific rule or principle from the domain skills.

### 2. Prioritize by Impact
Not all issues carry equal weight. Prioritize: accessibility and usability before aesthetics. Functional defects before stylistic preferences.

### 3. Constructive Criticism With Actionable Solutions
Every identified weakness is accompanied by a concrete improvement recommendation. "This is bad" is not a review -- "This violates rule X; a better approach would be Y" is a review.

### 4. Completeness Through Checklists
The checklists from individual domain skills form the foundation of the review. No item is skipped.

## Rules

### Review Workflow

- **DO**: ALWAYS begin with an overall assessment before drilling into details.
- **DO**: Work through the domains in the following order (by priority):
  1. `accessibility` -- Accessibility (legal obligation, BFSG)
  2. `usability` -- Usability
  3. `ux-design` -- User experience and flows
  4. `ui-design` -- Layout, hierarchy, components
  5. `web-typography` -- Typography, readability, scale
  6. `color-theory` -- Color, contrast, scheme
  7. `responsive-design` -- Behavior across breakpoints
  8. `navigation-design` -- Navigation structure and clarity
  9. `images-media` -- Images, video, performance
  10. `branding-identity` -- Brand consistency
  11. `landing-pages` -- Conversion optimization (if landing page)
  12. `customer-journey` -- User journey and touchpoints
  13. `component-patterns` -- Component architecture
  14. `ui-patterns` -- Interaction patterns
  15. `visual-direction` -- Visual direction and trends
  16. `design-trends` -- Currency and contemporaneity
  17. `design-process` -- Process quality
  18. `ai-design-workflow` -- AI integration in design
  19. `website-audit` -- Technical quality
  20. `agent-ui-design` -- Agent interfaces (if applicable)
- **DO**: Walk through the corresponding checklist for each domain.
- **DO**: Categorize findings by severity: Critical / Important / Recommendation.
- **DON'T**: Skip domains just because they are "probably fine."
- **DON'T**: Record subjective opinions without a rule reference as findings.

### Assessment Structure

- **DO**: Structure every finding as: Domain > Rule > Finding > Severity > Solution.
- **DO**: Attach screenshots or code examples as evidence where possible.
- **DO**: Explicitly call out positive aspects -- not just deficiencies.
- **DON'T**: Exceed 20 findings per domain. Prioritize the most impactful ones.

### Severity Levels

- **Critical**: Accessibility violations (BFSG), functional defects, security issues. MUST be resolved immediately.
- **Important**: Usability problems, inconsistencies, performance deficiencies. SHOULD be resolved before launch.
- **Recommendation**: Stylistic improvements, optimizations, best practices. CAN be addressed in future iterations.

## Patterns

### Quick Review (30 Minutes)
Focus on the top 6 domains: accessibility, usability, ux-design, ui-design, web-typography, color-theory. Checklist pass without deep analysis.

### Standard Review (2 Hours)
All 20 domains. Checklists completed in full. Findings documented with severity and solution. Summary with top 5 priorities.

### Deep Audit (1 Day)
Full review plus: screen reader testing, Lighthouse analysis, performance measurement, cross-browser testing, mobile device testing. Detailed report with prioritized action items.

### Comparative Review
Analyze a website against competitors. Identify the strongest solution per domain. Provide recommendations for differentiation and improvement.

## Anti-Patterns

### Cherry-Picking
Only flagging the obvious issues while overlooking systemic deficiencies. **Solution**: Work through checklists in full.

### Aesthetics Bias
Rating well-designed websites more leniently despite poor usability or accessibility. **Solution**: ALWAYS evaluate accessibility and usability first.

### Reviewing Without Context
Evaluating a design without understanding the target audience, business goals, or industry. **Solution**: Gather context first, then evaluate.

### Forgetting the Solution
Listing problems without improvement recommendations. **Solution**: Every finding requires at least one concrete suggestion.

## Checklist

### Before the Review
- [ ] Target audience and business goals known?
- [ ] Industry and competitors identified?
- [ ] Pages/screens to review defined?
- [ ] Review depth determined (Quick / Standard / Deep)?

### During the Review
- [ ] All relevant domains covered?
- [ ] Domain checklists completed in full?
- [ ] Findings categorized by severity?
- [ ] Solution recommendations for every finding?
- [ ] Positive aspects acknowledged?

### After the Review
- [ ] Summary with top 5 priorities prepared?
- [ ] Critical findings clearly flagged?
- [ ] Next steps defined?

## Cross-References

This meta-skill orchestrates all 20 domain skills:

**Core Design**: `ui-design`, `ux-design`, `web-typography`, `color-theory`, `accessibility`
**Structure & Navigation**: `usability`, `responsive-design`, `navigation-design`
**Content & Media**: `images-media`, `branding-identity`
**Strategy & Process**: `customer-journey`, `design-process`, `ai-design-workflow`
**Pages & Audit**: `landing-pages`, `website-audit`
**Patterns & Trends**: `design-trends`, `ui-patterns`, `visual-direction`, `component-patterns`
**Specialized**: `agent-ui-design`
