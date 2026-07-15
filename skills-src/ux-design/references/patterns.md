# UX Design -- Patterns (Reference)

## Progressive Disclosure

**When**: Complex content, long forms, extensive settings.

**Implementation**:
- Show only the essentials at the first level
- Offer "Learn more" options for details
- Multi-step forms instead of one long form
- Accordions for optional supplementary information

**Benefit**: Reduces cognitive overload and lowers the entry barrier.

**Example**: Checkout in 3 steps (Address > Shipping > Payment) instead of one long form.

## Onboarding Flow

**When**: New users, complex applications, SaaS products.

**Implementation**:
- Maximum 3-5 steps
- Progress indicator visible
- Each step has a clear action
- Offer a skip option
- After completion: direct access to the product's core value

**Rules**:
- No onboarding without a progress indicator
- Never more than one decision per step
- "Set up later" option for optional steps

## Search-Centric Design

**When**: Content-heavy websites, e-commerce, knowledge bases.

**Implementation**:
- Prominent search bar (no hidden magnifying glass icon)
- Autocomplete with instant results
- Filter options by category
- Zero-results page with alternative suggestions

**Rules**:
- Search field at least 30 characters wide
- Results sorted by relevance
- Implement typo tolerance
- Remember and suggest recent searches

## Feedback Loop

**When**: Every user interaction.

**Implementation**:
- Visual feedback: hover state, active state, animations
- System feedback: loading indicator, progress bar
- Result feedback: success message, confirmation
- Tactile feedback on mobile: vibration for critical actions

**Timeframes**:
- 0-100ms: Instant (hover, tap feedback)
- 100-400ms: Transition/animation
- 400ms+: Loading indicator required (Doherty Threshold)

## Empty States

**When**: Empty lists, new accounts, no search results.

**Implementation**:
- Never show blank areas
- Always: explanation + call to action
- Example: "You don't have any projects yet. Create your first project."
- Add an appropriate illustration/icon

**Variants**:
- First visit: Welcome + entry action
- Empty search: Alternative suggestions + broader search
- Deleted content: Confirmation + undo option

## The 5 Planes Model (Garrett)

1. **Strategy**: Define user goals + business objectives
2. **Scope**: Prioritize features and content by user need
3. **Structure**: Information architecture and interaction design
4. **Skeleton**: Wireframes, layouts, interface design
5. **Surface**: Visual design, colors, typography

Rule: Always work from bottom to top. Never design the surface before strategy and structure are in place.

## UX Laws -- Quick Reference

| Law | Core Insight | Application |
|-----|-------------|-------------|
| Fitts' Law | Size + proximity = faster interaction | Touch targets min. 44x44px |
| Hick's Law | More options = slower decisions | Max. 7 options per group |
| Miller's Law | 7 +/- 2 information units | Chunking, navigation groups |
| Jakob's Law | Users expect familiar patterns | Follow conventions |
| Doherty Threshold | < 400ms feels instantaneous | Loading indicator from 400ms |
| Postel's Law | Be liberal in accepting, strict in producing | Flexible input validation |
