# Agent-UI-Design: Pattern Reference

> Detailed agent UI patterns based on the 21st.dev SDK and templates.

## Streaming Chat Message

**When:** Any AI-driven chat application.
**What:** Message is rendered character by character during SSE stream. Blinking cursor at the end. Markdown rendering for formatted responses. Code blocks with syntax highlighting.
**Reference:** 21st.dev AI SDK with `useChat` hook.
**Design Details:**
- Text appears word by word (not character by character -- feels more natural)
- Cursor: `|` blinking, 1s interval
- Markdown elements render as soon as they are complete (e.g., `**bold**` becomes bold once the closing `**` arrives)
- Code blocks: syntax highlighting only after the closing ` ``` `

## Tool Execution Card

**When:** Agent performs an action (read file, call API, run computation).
**What:** Embedded card in the chat stream:
- **Header**: Tool name as badge + status indicator (spinner/checkmark/error)
- **Body**: Collapsible input parameters (JSON) + formatted result
- **Footer**: Execution duration + optional retry button on error
**Design Details:**
- Card has a subtle border and slightly different background color
- Tool name in monospace font
- Status badge with color coding: blue (running), green (success), red (error)
- Result formatting depends on the tool type:
  - Text tools: Markdown-rendered
  - Data tools: table
  - Code tools: syntax-highlighted code block
  - Image tools: inline preview

## Three-Panel Layout

**When:** Agent dashboards, chat applications with context.
**What:** Three columns: Navigation/Threads (240px) | Chat (flex) | Context/Preview (320px).
**Reference:** 21st.dev Note Taker, Next.js Starter.
**Design Details:**
- CSS Grid: `grid-template-columns: auto 1fr auto`
- Left sidebar: thread list with search field
- Center column: chat with sticky input field at the bottom
- Right sidebar: context panel with tabs (Preview, Files, Settings)
- Both sidebars collapsible with transition
- Responsive:
  - Desktop (1024px+): all three panels
  - Tablet (768-1023px): chat + one sidebar
  - Mobile (<768px): chat only, sidebars as drawer/bottom sheet

## Form-Agent Hybrid

**When:** Form assistants, data entry with AI support.
**What:** Split screen: form on the left, chat on the right. Agent can populate form fields via tool call.
**Reference:** 21st.dev Form Autocomplete Template.
**Design Details:**
- 60/40 split (form gets more space)
- Agent-populated fields: brief highlight effect (blue outline, 500ms fade)
- User changes override agent values immediately
- Chat shows: "I have filled [field] with [value]" as system message
- Zod schema as single source of truth

## Real-Time Status Dashboard

**When:** Monitoring agents, DevOps tools, Slack bots.
**What:** Dashboard with live updates via WebSocket/SSE.
**Reference:** 21st.dev Slack Monitor Template.
**Design Details:**
- Status tiles: green (OK), yellow (warning), red (critical)
- Transition on color change (300ms ease)
- Log stream: scrollable list with auto-scroll
- Pause button: stops auto-scroll on manual scrolling
- Timestamp for each log entry
- Filter: by severity (Info, Warning, Error)

## Sources

- **21st.dev Agent SDK** -- Complete documentation (39 pages)
- **21st.dev Templates** -- 11 templates analyzed
- **Behance** -- lifeOS AI Agents App as agent UI reference
- **Dribbble** -- Dashboard designs for monitoring UIs
