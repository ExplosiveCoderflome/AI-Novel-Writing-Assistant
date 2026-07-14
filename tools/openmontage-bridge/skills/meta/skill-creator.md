# Skill Creator — Meta Skill

## When to Use

When you encounter a situation where no existing skill covers what you need to do, and the gap is reusable — not a one-off task. This skill teaches you to create new skills dynamically during a pipeline run.

Examples of when to create a new skill:
- A scene requires a visualization technique not covered by existing skills (e.g., "interactive map animation")
- A new tool is available but has no usage skill (e.g., a new TTS provider)
- A recurring pattern emerges across multiple stages that could be codified

Do NOT create a skill for:
- One-off tasks that won't recur
- Things already covered by an existing skill
- Pure tool configuration (that belongs in tool code)

## Protocol

### Step 1: Identify the Gap

Clearly articulate:
1. **What you need to do** that no existing skill covers
2. **Why it's reusable** — will future pipelines benefit?
3. **Where it fits** — which layer and directory?

### Step 2: Research Best Practices

Before writing the skill, research:
1. **Web search** for established approaches to this task
2. **Existing skills** in the repo for structural patterns
3. **Tool documentation** for any tools the skill will reference

### Step 3: Choose the Skill Type

| Type | Directory | Purpose |
|------|-----------|---------|
| Stage director | `skills/pipelines/<pipeline>/` | How to execute a specific pipeline stage |
| Meta skill | `skills/meta/` | Cross-cutting protocol (review, checkpoint, etc.) |
| Tool skill | `.agents/skills/` | How to use a specific API or tool effectively |
| Style skill | `styles/` | Visual/audio style definition (YAML playbook) |

### Step 4: Write the Skill

Follow this structure (adapt to skill type):

```markdown
# [Skill Name] — [Context]

## When to Use
[1-2 sentences: what situation triggers this skill]

## Prerequisites
[Table of required resources: schemas, prior artifacts, tools, other skills]

## Process

### Step 1: [First action]
[Clear instructions with examples]

### Step 2: [Second action]
[Clear instructions with examples]

...

### Step N: Self-Evaluate
[Quality rubric: scoring table with 1-5 scale]

### Step N+1: Submit
[How to persist the output]

## Common Pitfalls
[Bullet list of mistakes to avoid]
```

### Key Principles for Good Skills

1. **Teach thinking, not just doing.** A skill that says "generate an image" is useless. A skill that says "consider the emotional beat of this scene, research how top creators visualize this concept, then craft a prompt that includes the playbook's style anchors" is valuable.

2. **Include examples.** Show what good output looks like. Show what bad output looks like. The contrast teaches more than instructions alone.

3. **Reference concrete resources.** Don't say "check the schema." Say "validate against `schemas/artifacts/brief.schema.json`." Don't say "use a tool." Say "use `image_selector` with the playbook's `image_prompt_prefix`."

4. **Include a self-evaluation rubric.** Every skill should end with a scoring table. This forces the agent to check its own work before proceeding.

5. **Document pitfalls.** What goes wrong when this skill is executed poorly? Warn explicitly.

6. **Be opinionated.** A skill that says "you could do A or B" is less useful than one that says "do A because [reason], but fall back to B when [condition]."

### Step 5: Register the Skill

After writing the skill file:
1. Add an entry to `skills/INDEX.md`
2. If it's a pipeline stage skill, ensure the pipeline manifest references it in the stage's `skill` field
3. If it's a tool skill, place it in `.agents/skills/<tool-name>/`

### Step 6: Validate

Quick checks:
- [ ] File is well-formed markdown with clear headers
- [ ] All referenced schemas, tools, and resources exist
- [ ] Process steps are numbered and actionable
- [ ] Self-evaluation rubric is present
- [ ] Common pitfalls section is present
- [ ] No orphan references (everything mentioned exists in the repo)

## Common Pitfalls

- **Creating skills for one-off tasks**: If you'll never do this again, just do it inline. Skills are for patterns.
- **Vague instructions**: "Make it good" is not a skill. Specificity is what makes a skill useful.
- **No self-evaluation**: Without a rubric, the agent has no way to know if it followed the skill correctly.
- **Missing prerequisites**: A skill that references `image_selector` but doesn't list it in prerequisites will confuse future agents.
- **Over-engineering**: A 500-line skill for a simple task is worse than a 50-line one. Match complexity to the task.
