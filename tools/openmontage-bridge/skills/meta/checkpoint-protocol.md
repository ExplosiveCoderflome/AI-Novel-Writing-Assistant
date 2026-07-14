# Checkpoint Protocol — Meta Skill

## When to Use

After completing a stage's work AND passing review. This skill teaches you when and how to checkpoint, and when to ask the human for approval. It replaces the Python `checkpoint_policy.py` with an instruction-driven protocol.

Checkpoints are the save points of a pipeline. They enable resume-from-failure, human oversight, and audit trails.

## Protocol

### Step 1: Check Manifest Policy

Read the current stage's configuration from the pipeline manifest:

```yaml
- name: idea
  checkpoint_required: true      # Must we checkpoint?
  human_approval_default: true   # Must we ask the human?
```

| `checkpoint_required` | `human_approval_default` | Action |
|----------------------|------------------------|--------|
| true | true | Checkpoint + present to human for approval |
| true | false | Checkpoint + proceed automatically |
| false | * | Skip checkpoint entirely (rare) |

### Step 2: Prepare Checkpoint Data

Gather everything needed for the checkpoint:

1. **Stage name** — which stage just completed
2. **Status** — `"completed"` (or `"awaiting_human"` if approval needed)
3. **Artifacts** — the canonical artifact(s) produced by this stage
4. **Metadata** — review findings, cost snapshot, timing info

### Step 3: Write Checkpoint

Call the checkpoint utility:

```python
write_checkpoint(
    pipeline_dir,      # Project working directory
    project_name,      # Project identifier
    stage_name,        # e.g., "idea"
    status,            # "completed" or "awaiting_human"
    artifacts,         # {"brief": {...}} — the stage's output
)
```

The checkpoint utility will:
- Validate the artifact against its schema
- Write the checkpoint JSON to disk
- Include timestamp and stage metadata

### Step 4: Human Approval (If Required)

When `human_approval_default: true`:

1. **Present a summary** to the human:
   ```
   ## Stage Complete: [stage_name]

   ### Artifact Summary
   [Key details from the artifact — title, duration, key decisions]

   ### Review Findings
   [Summary from reviewer: N critical (all fixed), N suggestions]

   ### Cost So Far
   [Budget spent / total, breakdown by tool]

   ### Action Required
   Please review and approve to continue, or provide feedback for revision.
   ```

2. **Wait for human response:**
   - **Approved** → update checkpoint status to `"completed"`, proceed to next stage
   - **Revision requested** → go back to the stage director skill with the human's feedback, produce revised artifacts, re-review, re-checkpoint
   - **Abort** → stop the pipeline

3. **Approval stages** (which stages typically need human approval):
   - `idea` — Always. The creative direction defines everything downstream.
   - `script` — Always. The words are the foundation.
   - `scene_plan` — Usually. Visual choices are subjective.
   - `assets` — Rarely. Automated quality checks are sufficient.
   - `edit` — Rarely. Technical assembly, not creative.
   - `compose` — Rarely. But human may want to preview.
   - `publish` — Always. Human must approve before anything goes public.

### Step 5: Determine Next Stage

After checkpoint is written and approved (if needed):

```python
next_stage = get_next_stage(pipeline_dir, project_name)
```

This reads all existing checkpoints and returns the next stage that needs to run, or `None` if the pipeline is complete.

### Step 6: Resume Protocol

At the START of any pipeline run (not just after a stage), always check for existing progress:

```python
next_stage = get_next_stage(pipeline_dir, project_name)
```

If `next_stage` is not the first stage:
1. Inform the human: "Found existing progress. Resuming from stage: [next_stage]"
2. Load prior artifacts from checkpoints for context
3. Continue from that stage

If a checkpoint exists with status `"awaiting_human"`:
1. Inform the human: "Stage [name] is awaiting your approval"
2. Present the checkpoint data for review
3. Wait for approval before proceeding

### Sample Checkpoint (Reference-Driven Productions)

When a production is reference-driven (VideoAnalysisBrief exists), there is an
additional checkpoint between proposal approval and full production:

| Stage | checkpoint_required | human_approval_default | Notes |
|-------|--------------------|-----------------------|-------|
| `sample` | true | true | Always requires human approval |

The sample checkpoint:
1. Presents: rendered sample clip (10-15 seconds)
2. Cost: sample cost vs. projected full-video cost
3. Action: approve (→ proceed to script), revise (→ re-generate sample), abort

The sample checkpoint is NOT a pipeline stage — it's a sub-checkpoint within the
proposal stage. It does not produce a canonical artifact. It produces a rendered
preview clip stored at `projects/<name>/assets/sample/sample_v{N}.mp4`.

**Presentation format:**
```
## Sample Preview Ready

**Sample clip:** [path to sample_v1.mp4]
- Duration: [X] seconds (hook + 1 middle scene)
- Voice: [TTS provider + voice name]
- Visuals: [description — AI images, Remotion animations, etc.]
- Music: [source]

**Sample cost:** $[X.XX]
**Projected full video cost:** $[X.XX]

Does this feel right? I can adjust: voice, visual style, pacing, music, colors.
```

## Key Principles

1. **Always checkpoint completed work.** Even if `checkpoint_required: false`, consider checkpointing anyway if the stage took significant time or cost. Losing work is worse than an extra file on disk.

2. **Never skip human approval on creative stages.** `idea` and `script` shape everything. Rushing past them to save time produces videos nobody wants.

3. **Include cost snapshots.** The human should know how much has been spent and how much remains before approving expensive downstream stages (assets, compose).

4. **Checkpoints enable resume.** If the pipeline crashes at `compose`, the human can restart and it picks up from `compose` — not from `idea`. This is the whole point.

5. **Be transparent in approval requests.** Don't just show the artifact — show the review findings, the cost, and any concerns. Help the human make an informed decision.
