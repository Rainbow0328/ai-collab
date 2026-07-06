---
name: ux-design
description: User research, interaction patterns, information architecture, and UX methods. Defines the five-plane model, user flows, UX laws, and validation methods for user-centered digital products.
---

# UX Design

> Systematically designing user experiences -- from strategy to validated interaction.

## Scope

Use this skill when: You are planning user research, creating personas, defining information architectures, documenting user flows, designing interaction patterns, or auditing existing products for UX quality.

## Principles

### 1. The User Determines the Design -- Not the Designer
Every design decision is based on real user data. Assumptions without validation are speculation.

### 2. Design Experiences, Not Surfaces
UX encompasses the entire interaction -- from first perception to long-term usage.

### 3. Simplicity Beats Completeness
One feature that everyone understands is more valuable than ten features that nobody can find.

### 4. Emotions Are Measurable Success Factors
Positive experiences generate trust and return visits. UX is directly business-critical.

### 5. Iteration Over Perfection
Rapid prototyping, early testing, and continuous improvement beats extended planning phases.

## Rules

### The 5 Planes of User Experience (Garrett Model)

- **DO**: Work from bottom to top: Strategy > Scope > Structure > Skeleton > Surface.
- **DO**: At Plane 1 (Strategy), define: Who are the users? What are their goals? What are the business objectives?
- **DO**: At Plane 2 (Scope), prioritize features by user need, not by stakeholder wishes.
- **DON'T**: Jump directly to visual design (Plane 5) without defining the underlying planes.

### User Research

- **DO**: Conduct at least 5 user interviews or usability tests BEFORE design.
- **DO**: Create data-driven personas: name, demographics, goals, pain points, context.
- **DO**: Use empathy maps as a quick format: What does the user think, feel, say, and do?
- **DON'T**: Create personas based on team assumptions. At least 3 real data points per persona.
- **DON'T**: Test only with colleagues. Always test with the actual target audience.

### Information Architecture (IA)

- **DO**: Structure content according to the users' mental model, not the organizational structure.
- **DO**: Conduct card sorting to validate the content structure.
- **DO**: Keep navigation depth shallow: max. 3 clicks to reach target content.
- **DO**: Label navigation items in user language, not in industry jargon.
- **DON'T**: Use mega-menus with more than 7 main categories (Miller's Law: 7 +/- 2).

### Interaction Design

- **DO**: Provide immediate feedback on every action (max. 400ms without feedback).
- **DO**: Make error handling helpful: WHAT went wrong and HOW to fix it.
- **DO**: Provide undo capability for destructive actions (min. 5-second undo window).
- **DO**: Reduce decisions per page (Hick's Law).
- **DON'T**: Show error messages only after form submission. Inline validation is the standard.
- **DON'T**: Use confirmation dialogs for trivial actions. Only for irreversible actions.

### UX Laws

- **DO**: Fitts' Law -- Touch targets at least 44x44px, close to the expected location.
- **DO**: Jakob's Law -- Follow established conventions (users know other websites).
- **DO**: Doherty Threshold -- System responses under 400ms feel instantaneous.
- **DO**: Postel's Law -- Be liberal in what you accept, strict in what you produce.

### User Flows

- **DO**: Define the primary flow (happy path) + at least 2 alternative paths.
- **DO**: Document flows as flowcharts with decision points.
- **DO**: Validate flows with real users before creating wireframes.
- **DON'T**: Create flows that lead to dead ends (pages without a next action or a way back).

## Patterns

Detailed pattern descriptions: see `references/patterns.md`

### Progressive Disclosure
Show only the essentials at the first level. Details behind "Learn more." Multi-step forms instead of one long form.

### Onboarding Flow
Max. 3-5 steps. Progress indicator visible. Skip option. After completion: direct access to core value.

### Search-Centric Design
Prominent search bar. Autocomplete with instant results. Filter options. Zero-results page with alternatives.

### Feedback Loop
Visual feedback (hover, active), system feedback (loading indicator), result feedback (success message).

### Empty States
Never leave blank areas. Always: explanation + call to action + appropriate visual.

## Anti-Patterns

### Feature Creep
Ever more features without validation. **Solution**: Every feature needs validated user demand. Under 20% usage = remove or hide.

### Assumption-Driven Design
"I think the user wants..." **Solution**: At least 3 data points per key decision.

### The Happy Path Only
Designing only for the ideal case. **Solution**: Define and design at least 3 error scenarios per flow.

### Cognitive Overload
Too many options per page. **Solution**: Miller's Law (7 +/- 2). One page = one primary goal.

### Ignoring Context
Same UX across all devices. **Solution**: Design context-dependently (mobile: on the go, one hand; desktop: more attention).

## Checklist

- [ ] Strategy plane defined: user goals and business objectives documented?
- [ ] At least 3 data-driven personas created?
- [ ] User flows documented (happy path + edge cases)?
- [ ] Information architecture validated (card sorting or tree testing)?
- [ ] Navigation labels in user language (no internal jargon)?
- [ ] Navigation depth max. 3 levels?
- [ ] Immediate feedback on every action (under 400ms)?
- [ ] Error handling helpful (WHAT + HOW)?
- [ ] Undo for destructive actions?
- [ ] Inline validation on forms?
- [ ] Empty states with explanation and call to action?
- [ ] Touch targets at least 44x44px?
- [ ] Max. 7 main navigation items?
- [ ] No feature without validated user demand?

## Cross-References

- `ui-design` -- Visual implementation of UX concepts
- `accessibility` -- Inclusive design as a UX cornerstone
- `usability` -- Testing methods and heuristics
- `navigation-design` -- IA implementation in navigation structures
- `customer-journey` -- UX in the overall context of the user journey
- `design-process` -- UX methods in the project workflow
- `landing-pages` -- Conversion-optimized UX patterns
