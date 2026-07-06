# Component-Patterns: Pattern Reference

> Detailed component patterns for modern web applications.

## Three-Panel Layout

**When:** Agent dashboards, chat applications with context.
**What:** Three columns: Navigation/Threads (240px) | Chat (flex) | Context/Preview (320px). Middle column flexible, side panels collapsible.
**Reference:** 21st.dev Note Taker, Next.js Starter.
**Implementation:**
- CSS Grid with `grid-template-columns: auto 1fr auto`
- Sidebar toggle with transition (width 0 <-> 240px)
- On mobile: main content fullscreen, panels as drawers

## Progressive Disclosure Card

**When:** Complex datasets, API responses, debug information.
**What:** Compact summary as default. Click/toggle reveals details. Three tiers: Summary > Details > Raw Data.
**Implementation:**
- Collapsible sections with `<details>`/`<summary>` or Radix Accordion
- First tier: 2-3 line summary
- Second tier: Formatted data in table or list
- Third tier: Raw JSON/code in monospace

## Form-Agent Hybrid

**When:** Form assistants, data entry with AI support.
**What:** Split screen: form left, chat right. Agent can populate form fields via tool call. User can override manually.
**Reference:** 21st.dev Form Autocomplete Template (React Hook Form + Zod + discriminated union schemas).
**Implementation:**
- Two-column layout with independent scroll
- Zod schema as single source of truth for validation
- Agent-populated fields visually marked (e.g., blue border)
- User changes override agent values without warning

## Real-Time Status Dashboard

**When:** Monitoring agents, DevOps tools.
**What:** Dashboard with live updates via WebSocket/SSE. Color-coded status tiles (green/yellow/red). Log stream as scrollable list.
**Reference:** 21st.dev Slack Monitor Template.
**Implementation:**
- SSE connection for live updates
- Status tiles with transition on color change
- Auto-scroll in log stream with "Pause" option on manual scroll

## Skill Configuration Panel

**When:** Agent setup, system prompt configuration.
**What:** Sidebar or modal with:
- Text field for system prompt (max 4,000 characters)
- Skill library with assignment UI
- Environment variable editor (key-value pairs)
- Deploy button with status feedback
**Reference:** 21st.dev Agent SDK documentation.

## Sources

- **21st.dev Agent SDK** -- Quickstart, Core Concepts, Templates
- **21st.dev Templates** -- Next.js Starter, Note Taker, Form Autocomplete, Slack Monitor
- **Godly Featured Products** -- Amie, Reflect, Notion, Linear, Vercel
