---
name: ai-design-workflow
description: AI tool integration into the design process, structured prompting for designers, creative AI usage with clear boundaries, and review workflows.
---

# AI Design Workflow

> AI is an assistant, not an autopilot. You retain control over direction, decisions, and quality. AI accelerates individual steps but replaces neither strategy nor judgment.

## Scope

Use this skill when you:
- Integrate AI tools purposefully into design phases
- Structure prompts for design tasks
- Evaluate and contextualize AI-generated content (text, images)
- Use AI as a sparring partner during reviews
- Inform clients about AI usage
- Want to preserve your own design signature despite using AI

## Principles

### 1. AI Is an Assistant, Not an Autopilot
You retain control. AI accelerates individual steps but replaces neither strategy nor judgment.

### 2. The Workflow Decides, Not the Tool
Define in advance which phases AI assists with and which it does not. Without a clear process, results are arbitrary.

### 3. Prompting Is Briefing
The same principles that apply to a good client briefing apply to AI: context, role, task, format, tone.

### 4. Combinatorial Strength, Conceptual Weakness
AI interpolates between known patterns (combinatorial creativity). The deliberate break with conventions comes from the human.

### 5. Transparency Toward Clients
Communicate openly where and how AI is used in the project. Concealed usage erodes trust.

### 6. Every AI Output Is a Draft
No AI output goes into production unchecked. Every result undergoes a human review.

## Rules

### DO: Deploy AI Purposefully per Design Phase

| Phase | AI Usage | Human Decides |
|---|---|---|
| Briefing | Analyze gaps and contradictions | Which questions are relevant |
| Research | Describe industry patterns, competition | Which insights are relevant |
| Personas | Sharpen assumptions, plausibility checks | Final persona definition |
| Concept | Moodboard variations, creative techniques | Which direction to pursue |
| Visual Design | Color palettes, font pairings, microcopy | Composition, consistency, final design |
| Review | Critical assessment, accessibility review | Whether feedback is implemented |
| Handoff | Documentation templates, style guide copy | Factual accuracy |

### DO: Structure the Prompt Like a Briefing
An effective prompt contains 5 elements:
1. **Role:** Who should the AI be? ("You are an experienced UX designer...")
2. **Context:** Starting situation (project, industry, target audience)
3. **Task:** What exactly should be done? (one task per prompt)
4. **Format:** In what form? (list, table, prose)
5. **Constraints:** What should NOT happen? (restrictions, style guidelines)

### DO: Prompt Iteratively Instead of One-Shot
- START with a rough prompt, evaluate, refine.
- USE follow-up prompts: "Make it more formal," "Narrow it down to 3 variants," "Explain your choice."
- A chain of prompts is better than one perfect prompt.

### DO: Use AI as a Sparring Partner in Reviews
- DESCRIBE a finished design in words and request a critical assessment.
- ASK about misunderstandings, unclear elements, accessibility barriers.
- The act of formulating the description alone often reveals weaknesses.

### DO: Evaluate AI-Generated Images Based on Context
- **Suitable:** Abstract backgrounds, generic illustrations, concept visualizations.
- **Unsuitable:** Authentic corporate photography, portraits, brand-specific imagery.
- Communicate clearly to the client what is a placeholder and what is final material.

### DON'T: Use AI as a Last Resort When Out of Ideas
- If all variations feel generic, the problem is a missing concept, not a better prompt.
- Go back to the strategy phase.

### DON'T: Adopt AI Output Without Contextual Review
- AI has no knowledge of company history, market context, or customer sentiment.
- Validate every result against the briefing, brand, and target audience.

### DON'T: Recycle Prompts Across Projects
- Using the same prompts across different projects leads to interchangeable results.
- Always adapt prompts to the project context.

### DON'T: Use AI as a Substitute for User Testing
- AI generates hypotheses but does not simulate real reactions.
- Usability tests with real people remain mandatory.

## Patterns

### Briefing Analysis Prompt
At project kickoff: "Here is a project briefing for [project type]. Identify open questions, unclear requirements, and points that need to be clarified before starting." Result: Structured list of questions. See `references/prompt-patterns.md` for details and prompt templates.

### Moodboard Divergence
Early concept phase: 1. Generate 15–20 variations with image generators, 2. Curate down to 2–3 directions, 3. Present as a decision-making basis.

### SCAMPER Prompt Chain
For evolving existing ideas: AI examines an idea through each SCAMPER lens (Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse).

### Copy Refinement Loop
For microcopy, button labels, error messages: 1. Describe context, tone, and function, 2. Generate 5 variations, 3. Select the best and refine.

### AI Review Session
After visual design, before handoff: 1. Describe the design in detail using words, 2. Request a critical assessment regarding clarity, accessibility, and consistency, 3. Use the response as a checklist.

### Documentation Accelerator
During the handoff phase: Describe design decisions and have a structured documentation template generated. Framework produced in minutes instead of hours.

## Anti-Patterns

### The AI Sameness Trap
All projects look alike because the same tools are used with similar prompts. **Solution:** Treat AI output as raw material, never as the final product. Your own design signature must remain recognizable.

### The Prompt Perfectionist
Spending hours crafting the perfect prompt instead of working iteratively. **Solution:** Start with an 80% prompt, refine in 2–3 iterations.

### AI as an Excuse for Lacking Expertise
"The AI did it that way" as a justification. **Solution:** Every decision must be defensible by the designer.

### Hype-Driven Feature Adoption
Integrating every new AI feature immediately without evaluating its value. **Solution:** Evaluate in a test project before production use.

## Checklist

- [ ] AI usage explicitly planned per design phase (where YES, where NO)
- [ ] Prompts contain role, context, task, format, and constraints
- [ ] AI-generated content documented internally
- [ ] Every AI output validated against briefing and brand values
- [ ] AI-generated images labeled as concept material or final
- [ ] Client informed about AI usage
- [ ] AI review session conducted before handoff
- [ ] Usability tests with real users planned (not replaced by AI)
- [ ] Own design signature recognizable in the final result

## Cross-References

- `design-process` — The AI workflow is an extension, not a replacement for the design process
- `customer-journey` — AI can accelerate persona development and touchpoint analysis
- `landing-pages` — AI-generated text and images must meet landing page standards
- `website-audit` — AI tools can support website analysis
- `branding-identity` — AI output must align with brand identity
