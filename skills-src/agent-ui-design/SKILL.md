---
name: agent-ui-design
description: Design patterns for chat interfaces, agent UX, streaming UI, and tool visualization. Covers chat architecture, message types, streaming rendering, tool execution cards, and sandbox UI derived from 21st.dev Agents SDK documentation and templates.
---

# Agent-UI-Design

> Design patterns for chat interfaces, agent UX, streaming UI, and tool visualization. Based on 21st.dev Agents SDK and award-winning agent products.

## Scope

Use this skill when:
- You are designing a chat interface for an AI application
- You need to visually represent agent tool calls
- You are implementing streaming rendering for real-time text output
- You are visualizing sandbox states and execution environments
- You are designing a three-panel layout for agent dashboards

## Principles

### 1. Agent-Ready Design
Components must natively support streaming content, tool calls, and asynchronous state transitions. Chat UIs are a core pattern, not an add-on.

### 2. Transparency over Magic
The user must know at all times what the system is doing. No silent background work -- every agent step is visible.

### 3. Progressive Complexity
The default view shows the essentials. Details (tool parameters, raw data, logs) are available on demand.

### 4. Streaming as Experience
Real-time text output is not a technical detail but a deliberately designed UX element. The speed at which text appears influences perceived intelligence.

### 5. Errors as Design Cases
Tool errors, timeouts, and unexpected results are normal states, not exceptions. They require dedicated visual design.

## Rules

### Chat Architecture
- **DO**: Three-column chat architecture following the 21st.dev pattern:
  - **Thread Sidebar** (left): List of past conversations, scrollable, with search.
  - **Chat Panel** (center): Message stream with input field. Primary interaction.
  - **Context Panel** (right): Optional, for results, previews, forms.
- **DO**: Lazy-load message history. Only the last N messages initially, older ones on scroll-up.
- **DON'T**: Keep the entire message history in client state. Use server-side persistence.
- **DON'T**: Chat panel without a visible input field. It must always be clear where to type.

### Message Types
- **DO**: Differentiate messages by role:
  - **User Message**: Right-aligned, accent color, compact layout.
  - **Assistant Message**: Left-aligned, neutral, expandable for tool results.
  - **System Message**: Centered, subtle, informational.
  - **Tool Call**: Visually distinct with status indicator.
- **DO**: Markdown rendering in assistant messages (headings, lists, code blocks).
- **DO**: Code blocks with syntax highlighting and copy button.
- **DON'T**: Style all message types identically. Visual differentiation provides orientation.

### Streaming Rendering
- **DO**: Display text character- or word-by-word with a cursor indicator.
- **DO**: AI SDK `useChat` hook or SSE streaming for real-time rendering.
- **DO**: During streaming: auto scroll-to-bottom, stop button visible.
- **DON'T**: Block rendering during generation. The user must be able to scroll at all times.
- **DON'T**: Streaming without a visual cursor. The user must see that more text is coming.

### Tool Visualization
- **DO**: Display tool calls within the chat stream:
  - **Tool Name**: As label/badge before the result.
  - **Input Parameters**: Collapsible, viewable for power users.
  - **Result**: Formatted by type (text, table, code, image).
  - **Status**: Loading spinner > success checkmark > error icon.
- **DO**: Tool results as embedded cards in the message stream.
- **DO**: Error states explicitly: what went wrong, what the user can do.
- **DON'T**: Tool calls without visual feedback. No silent execution.
- **DON'T**: Raw JSON output. Always format for human readability.

### Sandbox UI
- **DO**: Visually communicate sandbox state:
  - **Created**: Indicator that the environment is ready.
  - **Active**: Green status dot.
  - **Executing**: Animated state with progress indication.
  - **Terminated**: Final state with result summary.
- **DO**: File trees as interactive tree structures with file preview.
- **DON'T**: Sandbox details in the default view. Use progressive disclosure.

Extended rules and examples: see `references/implementation.md`

## Patterns

| Pattern | Usage | Core Idea |
|---|---|---|
| Streaming Chat Message | Every AI chat app | SSE stream, cursor, Markdown rendering |
| Tool Execution Card | Agent performs an action | Badge + collapsible params + status |
| Three-Panel Layout | Agent dashboards | Threads + Chat + Context |
| Form-Agent Hybrid | Form assistants | Form + Chat, agent populates fields |
| Real-Time Status Dashboard | Monitoring agents | Live updates, color-coded tiles |

Detailed patterns: see `references/patterns.md`

## Anti-Patterns

1. **Chatbot without context panel** -- Results only inline in the chat. Complex outputs need their own space.
2. **Tool results as JSON dump** -- Raw API responses. Always present in human-readable format.
3. **Invisible agent work** -- No feedback during tool execution. The user thinks the system is frozen.
4. **Single message design** -- All messages styled identically. Role differentiation is mandatory.
5. **Endless streaming without stop** -- No cancel button during generation.
6. **Modal tool results** -- Tool outputs as modals instead of inline. Interrupts the conversation flow.
7. **Thread sidebar without search** -- With more than 10 conversations, search and filter are essential.
8. **Missing retry option** -- Tool errors without the ability to retry.

## Checklist

- [ ] Chat messages differentiated by role (user, assistant, system, tool)
- [ ] Streaming rendering with visible cursor implemented
- [ ] Stop button visible during generation
- [ ] Tool calls have loading/success/error states
- [ ] Tool results formatted, not raw JSON output
- [ ] Tool parameters available as collapsible
- [ ] Three-panel layout: threads + chat + context
- [ ] Message history lazy-loaded (not all in client)
- [ ] Code blocks with syntax highlighting and copy button
- [ ] Markdown rendering in assistant messages
- [ ] Sandbox states visually communicated
- [ ] Retry button on tool errors
- [ ] Mobile: chat panel as fullscreen, sidebar as drawer
- [ ] Keyboard shortcuts: Enter to send, Shift+Enter for line break

## Cross-References

- `component-patterns` -- Base component architecture and token system
- `design-trends` -- AI-native interface as a current trend
- `ui-patterns` -- Command palette and general UI patterns
- `visual-direction` -- Color palettes and typography for agent interfaces
- `usability` -- Usability fundamentals for chat interfaces
- `accessibility` -- Screen reader compatibility for chat UIs
- `responsive-design` -- Mobile strategies for three-panel layouts
