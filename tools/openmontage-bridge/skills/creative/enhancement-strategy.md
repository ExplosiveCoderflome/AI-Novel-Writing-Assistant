# Enhancement Strategy Skill

## When to Use

Apply this skill when deciding how to enhance talking-head footage: which
face/color/audio presets to use, what overlays to add, and how to balance
enhancement visibility with naturalness.

## Enhancement Tools

| Tool | What It Does | Recommended Preset |
|------|-------------|-------------------|
| `face_enhance` | Skin smoothing, sharpening, tone correction | `talking_head_standard` |
| `color_grade` | Cinematic color look with intensity control | `cinematic_warm` at 0.85 |
| `audio_enhance` | Loudness normalization, noise reduction, EQ | `clean_speech` |
| `code_snippet` | Render code as styled overlay image | `monokai` theme |
| `diagram_gen` | Generate box/flow diagrams as overlay images | `dark` theme |
| `image_selector` | AI-generated illustrations (requires API key) | — |

## Enhancement Chain

Apply in this order — each step is optional and gracefully skipped on failure:

```
raw footage
  → subtitle burn (video_compose)
  → face enhance (face_enhance)
  → color grade (color_grade)
  → audio enhance (audio_enhance)
  → final encode (video_compose)
```

### Face Enhancement Presets

| Preset | When to Use |
|--------|-------------|
| `talking_head_standard` | Default for any talking head — smoothing + sharpening + warm |
| `soft_skin` | Webcam footage with visible pores — gentle smoothing |
| `sharpen` | Soft/blurry camera — adds edge definition |
| `brighten` | Dark/underlit footage — lifts shadows and midtones |
| `denoise` | Grainy footage (low light, high ISO) — temporal noise reduction |

### Color Grade Profiles

| Profile | Look | Intensity |
|---------|------|-----------|
| `cinematic_warm` | Warm highlights, lifted shadows, slight saturation | 0.85 |
| `cinematic_cool` | Teal shadows, orange highlights | 0.7 |
| `bright_clean` | Vivid, lifted, YouTube-style | 0.8 |
| `moody_dark` | Crushed blacks, desaturated — dramatic | 0.6 |
| `neutral` | Minimal correction — just normalizes levels | 1.0 |

### Audio Enhancement Presets

| Preset | When to Use | Target |
|--------|-------------|--------|
| `clean_speech` | Default talking head — full processing chain | -16 LUFS |
| `voice_clarity` | Speaker sounds muddy — boosts 3kHz/5kHz presence | -16 LUFS |
| `podcast` | Interview/podcast — heavier compression | -16 LUFS |
| `noise_reduce` | Noisy environment — aggressive FFT denoising | -16 LUFS |
| `normalize_only` | Clean source that just needs loudness matching | -16 LUFS |

## Overlay Enhancement Types

| Type | When to Use | Tool | Placement |
|------|-------------|------|-----------|
| **Text overlay** | Key terms, statistics, quotes | video_compose overlay | Upper or lower third |
| **Code snippet** | Technical content, API examples | code_snippet → overlay | Side of frame or full-screen |
| **Diagram** | Explaining a concept visually | diagram_gen → overlay | Side of frame or full-screen |
| **Lower third** | Speaker name, topic label | video_compose overlay | Bottom 20% of frame |

## Overlay Density Guidelines

### Short-form (< 60 seconds)
- High density: overlay every 3-5 seconds
- Quick visual changes, bold text
- Subtitles **mandatory** (most viewers watch muted)

### Medium-form (1-10 minutes)
- Moderate density: overlay every 10-20 seconds
- Let the speaker carry sections without visual competition

### Long-form (> 10 minutes)
- Low density: overlay every 30-60 seconds
- Only enhance when the content benefits (key points, complex topics)

## Placement Rules

1. **Never cover the speaker's face** — eyes, nose, mouth must remain visible
2. **Subtitles go in the bottom 20%** — margin_v: 50 for vertical, 40 for horizontal
3. **Consistent positioning** — once you place overlays on the left, keep them there
4. **Text overlays: 2-5 seconds on screen** — long enough to read, short enough to not feel stuck

## Deciding What to Enhance

For each section of the script, ask:

1. Is the speaker explaining something visual? → Add a diagram (`diagram_gen`)
2. Is there a key statistic or quote? → Add a text overlay
3. Is there code or technical content? → Add a code screenshot (`code_snippet`)
4. Has the speaker been on camera > 30 seconds straight? → Consider B-roll or overlay
5. Is this the intro or conclusion? → Bold text overlay with the key message

## Quality Checklist

- [ ] Face enhancement looks natural — not over-smoothed or orange
- [ ] Color grade is visible but subtle — skin tones look healthy
- [ ] Audio is normalized to target LUFS — consistent volume throughout
- [ ] Subtitles are readable on mobile, positioned below the face
- [ ] Overlays add value (not just decoration)
- [ ] Enhancement density matches content length and platform
