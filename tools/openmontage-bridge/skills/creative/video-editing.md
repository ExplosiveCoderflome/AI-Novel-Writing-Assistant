# Video Editing Skill

## When to Use

Apply this skill when making editorial decisions for talking-head content:
where to cut, what to remove, how to pace, and how to structure the final edit.

## Tools

| Tool | Role |
|------|------|
| `transcriber` | Analyze speech for filler words, dead air, false starts |
| `video_trimmer` | Execute cuts and speed adjustments |
| `frame_sampler` | Sample frames to evaluate visual quality at potential cut points |
| `video_compose` | Assemble the final edit |

## Editing Principles for Talking Heads

### What to Cut

1. **Filler words:** "um", "uh", "like", "you know" — cut at word boundaries using word timestamps.
2. **False starts:** When the speaker restarts a sentence, keep only the final take.
3. **Dead air:** Silence longer than 1.5 seconds should be trimmed to ~0.5 seconds.
4. **Off-topic tangents:** If the speaker wanders, cut to the next relevant segment.
5. **Repeated points:** Keep the best delivery, remove redundant takes.

### What NOT to Cut

- **Breath pauses:** Natural 0.3-0.8 second pauses between sentences. These sound natural.
- **Emphasis pauses:** Intentional pauses for dramatic effect.
- **Reactions and transitions:** Verbal bridges like "So..." or "Now..." that provide flow.

### Cut Technique

- **J-cut:** Audio from the next segment starts ~0.5s before the visual cut. Makes transitions feel smooth.
- **L-cut:** Audio from the current segment continues ~0.5s after the visual cut. Maintains continuity.
- **Hard cut:** Instant transition. Use at major topic changes.

### Pacing

- **Short-form (< 60s):** Aggressive cuts. Minimal dead air. High energy.
- **Medium-form (1-10 min):** Balanced. Keep natural pauses for breathing room.
- **Long-form (> 10 min):** Let scenes breathe. Only cut obvious problems.

## Edit Decision Structure

The `edit_decisions` artifact should include:

- **cuts:** Ordered list of segments to keep (source, in/out points, speed)
- **overlays:** Timed overlay placements (images, diagrams, lower thirds)
- **subtitles:** Subtitle configuration (enabled, style, source file)
- **music:** Background music settings (asset, volume, ducking, fades)
- **transitions:** Transition type and timing between cuts

## Quality Checklist

- [ ] No visible jump cuts (smooth transitions between segments)
- [ ] Audio doesn't pop or click at cut points
- [ ] Pacing matches the content energy and target platform
- [ ] Speaker's face is never covered by overlays
- [ ] All cuts are at word boundaries (not mid-word)
