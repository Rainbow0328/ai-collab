# Agent-UI-Design: Implementation Reference

> Extended rules and technical details for agent UI components.

## Chat Architecture per 21st.dev

### Thread Sidebar (left, 240px)
- Scrollable list of past conversations
- Search field with fuzzy matching at the top
- Prominent "New Conversation" button
- Active thread visually highlighted
- Truncated preview (first line of the last message)
- On mobile: drawer from the left, not permanently visible

### Chat Panel (center, flex)
- Message stream with automatic scroll-to-bottom
- Input field at the bottom edge, sticky
- Input field: textarea with auto-resize, Enter sends, Shift+Enter line break
- Optional: attachment button, slash commands, @-mentions
- During streaming: stop button next to input field

### Context Panel (right, 320px)
- Displays expanded tool results, previews, files
- Collapsible (toggle button at the edge)
- Tab interface for different context types (Preview, Files, Settings)
- On mobile: bottom sheet or separate screen

## Message Types in Detail

### User Message
```
[right-aligned, accent color as background]
┌─────────────────────────┐
│ Message text             │
│ 14:32                   │
└─────────────────────────┘
```
- Max width: 70% of the chat panel
- Accent color as background, white text
- Timestamp displayed subtly below the text

### Assistant Message
```
[left-aligned, neutral background color]
┌─────────────────────────────────────┐
│ 🤖 Agent Name                       │
│ Markdown-formatted content          │
│ with **bold**, lists, code blocks   │
│ 14:33                               │
└─────────────────────────────────────┘
```
- Max width: 85% of the chat panel (wider than user messages, as responses tend to be longer)
- Neutral background (surface color)
- Markdown rendering with syntax highlighting

### Tool Call
```
[left-aligned, embedded card]
┌─────────────────────────────────────┐
│ 🔧 search_web        ⏳ Running...  │
│ ─────────────────────────────────── │
│ ▸ Show parameters                   │
│ ─────────────────────────────────── │
│ Result:                             │
│ [Formatted output]                  │
│                          0.8s  🔄   │
└─────────────────────────────────────┘
```

## Streaming Rendering Technique

### SSE Stream with AI SDK
The 21st.dev Agent SDK uses Server-Sent Events (SSE) with the AI SDK `useChat` hook:
- Open connection on user message submit
- Text chunks are received word-by-word or character-by-character
- Markdown is rendered incrementally
- On stream end: final formatting and action buttons

### Cursor Indicator
- Blinking block cursor at the end of the streamed text
- CSS: `animation: blink 1s step-end infinite`
- Disappears after stream end
- Signals: "More text is on the way"

### Scroll Behavior During Streaming
- Auto-scroll when the user is at the bottom
- Scroll stops when the user manually scrolls up
- "Jump to bottom" button when not at the end
- Smooth scroll for new messages

## Tool Status Visualization

### State Machine
```
Pending → Running → Success
                  → Error → Retry → Running → ...
```

### Visual Mapping
| Status | Icon | Color | Animation |
|---|---|---|---|
| Pending | Clock | Gray | None |
| Running | Spinner | Blue/Accent | Rotation |
| Success | Checkmark | Green | Fade in |
| Error | Exclamation mark | Red | Shake |

### Collapsible Parameters
- Default: collapsed (only tool name and status visible)
- Click "Show parameters": JSON-formatted input data
- Click "Show result": formatted output
- Three levels: Summary > Formatted > Raw JSON

## Sandbox States

Per the 21st.dev model, sandboxes cycle through these states:

### Created
- Gray badge with "Ready"
- File tree is empty or shows initial structure

### Active
- Green status dot
- File tree is interactive, files can be opened

### Executing
- Pulsing blue indicator
- Terminal output is streamed
- Progress bar when available

### Completed
- Static badge with result summary
- Exit code visible (0 = green, != 0 = red)
- Output and artifacts available

## Sources

- **21st.dev Agent SDK** -- 39 documentation pages: Quickstart, Core Concepts (Agent, Tool, Skill, Sandbox, Thread, Relay), Chat API (SSE Streaming), Messages & History, Sandboxes & Infrastructure
- **21st.dev Templates** -- Next.js Starter (Chat UI + DuckDuckGo), Note Taker (Three-Panel), Form Autocomplete (React Hook Form + Zod), Slack Monitor (Real-Time), Docs Assistant, BrowserUse Agent
- **Behance** -- lifeOS AI Agents App UX/UI as agent UI reference
- **Godly** -- Amie, Reflect, Linear as productivity app reference
