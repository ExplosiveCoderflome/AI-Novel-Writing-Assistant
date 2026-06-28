# AI Novel Editorial Console Design

## Design Goal

The public site should feel like an editorial desk for long-form fiction plus a capable AI production console. It should not look like a generic SaaS landing page or a pile of feature cards.

## Visual Direction

- Use real product screenshots as proof. Product imagery should carry the page.
- Lead with a cinematic, full-bleed hero. The first viewport should communicate "from idea to full novel" immediately.
- Combine clean editorial surfaces with dark console sections.
- Keep the interface restrained: thin borders, 8px radii, calm spacing, no decorative blobs.

## Typography

- Large headings should use a serif-first stack to create a literary/editorial tone.
- Body and UI text should use a clean sans stack for clarity.
- Do not use viewport-scaled fonts directly. Use `clamp()` with clear min/max values.
- Keep letter spacing at 0.

## Color System

- Paper: `#f7f9f8`
- Paper deep: `#edf4f1`
- Ink: `#101417`
- Muted text: `#5d6872`
- Line: `#d8e0dd`
- Dark console: `#101416`
- Elevated console: `#1d2528`
- Accent: `#147f91`
- Accent strong: `#0f6776`
- Accent soft: `#d7edf1`
- Signal: `#d76457`
- Mint: `#55a984`

## Page Structure

1. Full-bleed hero with project promise, download, GitHub entry, and production route strip.
2. Small proof band for the key production capabilities.
3. Editorial production flow with large screenshots and step copy.
4. Dark product console section with layered screenshots and system modules.
5. Public docs entry that helps users understand the project, start using it, browse sidebar modules, and read the roadmap.
6. Audience and download section.
7. Final open-source CTA.

## Copy Rules

- Explain what users can do and what the system helps them finish.
- Avoid change-history wording such as "now", "previously", "migrated", or "upgraded".
- Prefer concrete production language: direction, world, character, chapter, review, repair, recovery.
