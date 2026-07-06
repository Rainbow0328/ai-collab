# Component-Patterns: Implementation Reference

> Extended rules and concepts for component architecture.

## Compound Component Pattern

Compound components share implicit state via context:

```tsx
// Anatomy of a compound component
<Tabs defaultValue="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Content 1</Tabs.Content>
  <Tabs.Content value="tab2">Content 2</Tabs.Content>
</Tabs>
```

**Rules:**
- Each sub-component is individually exported
- State is shared via React Context
- Children order defines layout
- Props on the root component control global behavior

## Variant System with cva

```tsx
import { cva } from "class-variance-authority";

const button = cva("rounded font-medium transition-colors", {
  variants: {
    intent: {
      primary: "bg-primary text-white hover:bg-primary/90",
      secondary: "bg-surface text-foreground border hover:bg-surface/80",
      ghost: "hover:bg-surface/50",
    },
    size: {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4 text-base",
      lg: "h-12 px-6 text-lg",
    },
  },
  defaultVariants: {
    intent: "primary",
    size: "md",
  },
});
```

## Design Token Hierarchy

### Tier 1: Global Tokens (Raw Values)
```css
:root {
  --blue-500: #3B82F6;
  --gray-100: #F3F4F6;
  --gray-900: #111827;
  --space-4: 1rem;
  --radius-md: 0.5rem;
}
```

### Tier 2: Semantic Tokens (Purpose-Bound)
```css
:root {
  --color-primary: var(--blue-500);
  --color-background: var(--gray-100);
  --color-foreground: var(--gray-900);
  --spacing-section: 7.5rem; /* 120px */
}

[data-theme="dark"] {
  --color-background: #0A0A0A;
  --color-foreground: #FAFAFA;
}
```

### Tier 3: Component Tokens (Specific)
```css
:root {
  --button-bg: var(--color-primary);
  --button-text: white;
  --card-padding: var(--space-4);
  --card-radius: var(--radius-md);
  --input-border: var(--color-border);
}
```

## Schema-Driven Forms

```tsx
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  message: z.string().min(10, "Message too short"),
});

// React Hook Form + Zod Resolver
const form = useForm({
  resolver: zodResolver(contactSchema),
});
```

**Field Anatomy:**
1. Label (above the field, not as placeholder)
2. Input (with aria-describedby for helper/error)
3. Helper text (below the field, subtle)
4. Error message (below the field, red, replaces helper on error)

## Server vs. Client Components

| Server Component | Client Component |
|---|---|
| Data fetching (fetch, DB) | Event handlers (onClick, onChange) |
| Rendering static content | useState, useEffect |
| Backend access | Browser APIs (localStorage, etc.) |
| Large dependencies server-side | Animations with Framer Motion |
| No JS sent to the client | Interactive forms |

**Rule of thumb:** Server Component as default. Only add `"use client"` when the build requires it.

## Sources

- **21st.dev Agent SDK** -- 39 documentation pages, 11 templates analyzed
- **Godly Featured Products** -- Amie, Reflect, Status, Notion, Linear, Vercel
- **Dribbble/Behance** -- Dashboard and SaaS designs
