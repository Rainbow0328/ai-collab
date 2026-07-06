---
name: component-patterns
description: Modern UI component selection, composition, and theming patterns for web applications. Covers compound components, design tokens, variant systems, responsive patterns, and form architecture derived from 21st.dev SDK, Godly featured products, and current best practices.
---

# Component-Patterns

> Modern UI component patterns for web applications. Component selection, composition, theming, and token systems following current standards (21st.dev SDK, Tailwind, Radix UI).

## Scope

Use this skill when:
- You are designing or selecting UI components
- You are building a design token system
- You are implementing theming (dark/light/custom)
- You are planning compound components or variant systems
- You are designing form architectures
- You are defining responsive component strategies

## Principles

### 1. Composition over Inheritance
Build components by assembling small, specialized parts. Props for configuration, children for content, slots for variation.

### 2. Server-First, Client Where Needed
Server Components as the default. Client Components only for interactivity (state, event handlers, browser APIs).

### 3. Token-Based Theming
Design tokens (CSS Custom Properties) control all visual aspects. No hardcoding of colors, spacing, or font sizes.

### 4. Accessibility as Architecture
ARIA roles, keyboard navigation, and focus management are part of the component definition, not an afterthought.

### 5. Composable Primitives
Base primitives (Button, Input, Text, Box) are unstyled and maximally flexible. Design system components build on top of them.

## Rules

### Component Structure
- **DO**: Each component as a single file with a clear export. One component = one responsibility.
- **DO**: Explicitly type the props interface (TypeScript). Zod schemas for validated inputs.
- **DO**: Compound components for complex UI elements:
  ```
  <Card>
    <Card.Header />
    <Card.Body />
    <Card.Footer />
  </Card>
  ```
- **DO**: Variants with class-variance-authority (cva) instead of conditional classes.
- **DON'T**: Components with more than 10 props. Split when responsibilities grow too many.
- **DON'T**: Runtime CSS-in-JS. Tailwind CSS or CSS Modules for static styles.
- **DON'T**: Div soup. Use semantic HTML elements (section, article, nav, header, footer, main).

### Theming and Design Tokens
- **DO**: Three-tier token system:
  - **Global Tokens**: Raw values (`colors.blue.500`, `spacing.4`, `radius.md`)
  - **Semantic Tokens**: Purpose-bound (`color.primary`, `color.surface`, `spacing.section`)
  - **Component Tokens**: Specific (`button.bg`, `card.padding`, `input.border`)
- **DO**: Theme switching via CSS Custom Properties with a `data` attribute or class on `html`/`body`.
- **DO**: Dark/light as minimum. Optionally: high contrast, brand-specific themes.
- **DON'T**: Inline styles for themeable values. Always reference tokens.
- **DON'T**: Token names that describe colors (`--blue-500`). Use semantic names (`--color-primary`).

### Form Components
- **DO**: Schema-driven forms: Zod schemas define fields and validation.
- **DO**: React Hook Form or similar for performance (uncontrolled components).
- **DO**: Consistent field anatomy: Label > Input > Helper Text > Error Message.
- **DON'T**: Custom selects without keyboard support. Use native Select or Radix UI Select.
- **DON'T**: Forms without loading and success states after submit.

### Responsive Components
- **DO**: Container queries for component-based responsiveness.
- **DO**: Mobile variants as dedicated states (chat panel becomes fullscreen, sidebar becomes drawer).
- **DO**: Touch targets at least 44x44px on mobile.
- **DON'T**: Hover-dependent interactions without a touch alternative.
- **DON'T**: Horizontal scrolling in components on mobile (exception: carousels).

Extended rules and code examples: see `references/implementation.md`

## Patterns

| Pattern | Usage | Core Idea |
|---|---|---|
| Three-Panel Layout | Dashboards, chat apps | Navigation (240px) + Content (flex) + Context (320px) |
| Progressive Disclosure Card | Complex data, API responses | Summary > Details > Raw Data |
| Form-Agent Hybrid | Form assistants | Form left, chat right, agent populates fields |
| Real-Time Status Dashboard | Monitoring, DevOps | Live updates via WebSocket/SSE, color-coded tiles |
| Skill Configuration Panel | Agent setup | System prompt + skill library + deploy button |

Detailed pattern descriptions: see `references/patterns.md`

## Anti-Patterns

1. **God Component** -- One component for chat, tools, form, and navigation simultaneously. Split it up.
2. **Prop drilling for theme** -- Theme values passed through 5+ levels. Use context or CSS Custom Properties.
3. **Client-side everything** -- Everything as a Client Component. Use Server Components for static content.
4. **Inline styles for layout** -- `style={{ marginTop: 20 }}` instead of token-based utilities.
5. **Modal for everything** -- Prefer inline expansion, drawers, or panels.
6. **Uncontrolled state explosion** -- Use a central state store or server state (React Query/SWR).
7. **Hardcoded breakpoints** -- Define breakpoint tokens in the theme configuration.
8. **Missing error boundaries** -- Place React Error Boundaries around critical sections.

## Checklist

- [ ] Every component has a typed props interface (TypeScript)
- [ ] Compound components for complex elements (Card, Dialog, Tabs)
- [ ] Variants with cva or similar system
- [ ] Design tokens in three tiers: global, semantic, component
- [ ] Theme switch via CSS Custom Properties, not JS runtime
- [ ] Forms use Zod schemas for validation
- [ ] Server Components as default, client only when needed
- [ ] Container queries for component-based responsiveness
- [ ] Error boundaries around critical UI sections
- [ ] Mobile touch targets at least 44x44px
- [ ] Keyboard navigation for all interactive elements
- [ ] ARIA roles and labels for screen readers
- [ ] Semantic HTML elements instead of div soup

## Cross-References

- `design-trends` -- Trends influencing component design (motion, dark mode)
- `ui-patterns` -- UI patterns implemented as components
- `visual-direction` -- Visual tokens (colors, typography, spacing) for the token system
- `agent-ui-design` -- Agent-specific components (chat, tools, streaming)
- `accessibility` -- Accessibility requirements
- `responsive-design` -- Breakpoint strategies and container queries
