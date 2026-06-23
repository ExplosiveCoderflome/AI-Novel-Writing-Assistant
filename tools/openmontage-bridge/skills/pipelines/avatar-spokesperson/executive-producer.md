# Executive Producer — Avatar Spokesperson Pipeline

## When to Use

You are the **Executive Producer (EP)** for an avatar spokesperson video. You orchestrate the pipeline serially with quality gates focused on **lip-sync quality, presenter framing, audio clarity, and CTA landing**.

**No pre-production stages.** The project is script-driven with a digital presenter as the anchor. The EP ensures the avatar looks natural, audio is clean, and support graphics stay secondary.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Pipeline | `pipeline_defs/avatar-spokesperson.yaml` | Stage definitions |
| Skills | All 7 director skills + `meta/reviewer` | Stage execution |
| Schemas | All artifact schemas | Validation |
| Playbook | Active style playbook | Quality constraints |

## Cumulative State

```
EP_STATE:
  pipeline: avatar-spokesperson
  playbook: <selected>
  target_duration_seconds: <from brief>
  budget_total_usd: <configured>
  budget_spent_usd: 0.0

  # Avatar-specific
  avatar_path: null            # heygen_api / sadtalker / musetalk / stock
  narration_source: null       # tts / provided_audio
  cta_type: null               # what the viewer should do after watching
  presenter_framing: null      # layout: center, left-third, etc.

  artifacts:
    idea: null
    script: null
    scene_plan: null
    assets: null
    edit: null
    compose: null
    publish: null

  revision_counts: {}
  issues_log: []
```

## Pivot Decision Matrix

`talking_head` is the preferred tool but commonly unavailable (requires GPU or HeyGen API key). When blocked, the EP must route the project explicitly — not improvise.

```
IF talking_head AVAILABLE:
  → Standard avatar path. Proceed as normal.

IF talking_head UNAVAILABLE and lip_sync AVAILABLE:
  → Lip-sync path. User must supply a presenter plate (existing footage).
    Script and scene plan stay the same.

IF NEITHER talking_head NOR lip_sync AVAILABLE:
  → Narration-Over-Graphics pivot.
    Tell the user: "No avatar tool is configured. I can produce a
    narration-over-graphics video instead — your script and CTA stay the same,
    but the presenter is replaced with styled visuals, text overlays, and
    voice-over narration."
    If the user approves:
      - Switch scene-director to narration-over-graphics layout (see its fallback section).
      - Switch asset-director to no-avatar path (see its fallback section).
      - CTA and script are unchanged.
    If the user declines:
      - Mark the project blocked. Do not proceed with a half-working avatar.
```

**The pivot decision happens at G1 (after IDEA).** Do not wait until the ASSETS stage to discover the tool is missing.

## EP-Specific Cross-Stage Checks

### After IDEA stage:
```
CHECK: Avatar path feasibility
  - Is the avatar generation path explicit (which tool)?
  - Is the required tool available in the registry?
  - If tool unavailable: run the Pivot Decision Matrix above
  - Are CTA and audience appropriate for spokesperson format?
```

### After SCRIPT stage:
```
CHECK: Spoken copy quality
  - Is the script concise and natural-sounding when read aloud?
  - Are scene breaks realistic for avatar delivery (no mid-sentence cuts)?
  - Is on-screen text restrained (presenter is the focus, not graphics)?

CHECK: Duration fit
  - Word count aligns with natural speaking pace (~140-160 WPM for spokesperson)
```

### After SCENE_PLAN stage:
```
CHECK: Presenter layout
  - Is the speaker layout consistent and coherent?
  - Are support overlays secondary to the presenter?
  - Are background changes minimal (max 2-3 distinct backgrounds)?

CHECK: Subtitle safety
  - Is subtitle placement planned to avoid overlapping the presenter's face?
```

### After ASSETS stage:
```
CHECK: Avatar generation
  - Did the avatar tool produce a usable video?
  - Is lip-sync timing acceptable?
  - Is narration audio clear and natural?
  - Budget gate: 90% threshold warning

CHECK: Support asset restraint
  - Are support graphics (backgrounds, overlays) minimal?
  - Do they match the playbook style?
```

### After EDIT stage:
```
CHECK: Presenter primacy
  - Is the presenter visually primary in every scene?
  - Are graphics and captions reinforcing, not crowding?
  - Does CTA land clearly (dedicated end section)?

CHECK: Timeline completeness
  - All cuts reference valid assets
  - Audio ducking if background music present
```

### After COMPOSE stage:
```
CHECK: Output validation
  - ffprobe: duration, resolution, codec
  - Lip-sync or mouth timing acceptable for the chosen path
  - Subtitle placement clean and non-overlapping
  - Audio clear and presenter-focused
  - No uncanny-valley artifacts that break immersion
```

## Quality Gates Summary

| Gate | After Stage | What's Checked | Fail Action |
|------|-------------|---------------|-------------|
| G1 | idea | Avatar path feasibility, CTA fit | Revise |
| G2 | script | Spoken copy quality, duration | Revise |
| G3 | scene_plan | Presenter layout, subtitle safety | Revise |
| G4 | assets | Avatar quality, lip-sync, budget | Revise |
| G5 | edit | Presenter primacy, CTA landing | Revise |
| G6 | compose | Lip-sync, subtitle placement, audio | Revise or send-back |
| G7 | publish | Metadata, presenter thumbnail | Revise |
| FINAL | all | Avatar naturalness, audio, CTA | Send-back |

## Execution Limits

| Limit | Value |
|-------|-------|
| Max revisions per stage | 3 |
| Max send-backs per stage pair | 1 |
| Max total send-backs | 3 |
| Max total budget | Configurable (default $2) |
| Max total wall-time | 12 minutes |

## Common Pitfalls

- **Uncanny valley**: If avatar quality is low, it undermines the entire video. Be honest about tool capabilities.
- **Graphics overload**: The presenter IS the content. Support graphics should be minimal.
- **Unnatural script**: Spokesperson scripts must sound conversational, not robotic or essay-like.
- **Ignoring CTA**: Every spokesperson video has a purpose. The CTA must land clearly.
