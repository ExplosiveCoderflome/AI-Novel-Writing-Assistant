# AI Novel Editorial Console Design

## Design Goal

The public site should feel like an editorial desk for long-form fiction plus a capable AI production console. It should not look like a generic SaaS landing page or a pile of feature cards.

## Visual Direction

- Use real product screenshots as proof. Product imagery should carry the page.
- Lead with an editorial, paper-and-ink hero. The first viewport should communicate "from idea to full novel" through the act of writing a book, rather than a decorative raster scene.
- Combine clean editorial surfaces with dark console sections.
- Keep the interface restrained: thin borders, 8px radii, calm spacing, no decorative blobs.

## Typography

- Large headings should use a Chinese serif-first stack (`Source Han Serif SC` / `Noto Serif SC` / Songti before Georgia) to avoid mixed Chinese-English heading weight jumps.
- Body and UI text should use a Chinese sans-first stack (`PingFang SC` / Microsoft YaHei before Inter) for clearer Chinese reading.
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

1. Split hero with a short Chinese serif promise, download, GitHub, docs, and an original SVG manuscript. Stack copy above the book on narrow screens.
2. Editorial production flow with large screenshots and step copy, directly after the hero. Keep route strips and capability checklists out of the first screen.
3. Dark product console section with layered screenshots and system modules.
4. Public docs entry that helps users understand the project, start using it, browse sidebar modules, and read the roadmap.
5. Audience and download section.
6. Final open-source CTA.

## Hero Illustration And Motion

- `src/components/HeroManuscript.tsx` owns the SVG composition and finite drawing sequence; `src/components/hero.css` owns the hero layout and illustration styles. Author the original pen movements in `scripts/generate-manuscript.mjs`, which uses seeded Rough.js at development/build startup to produce the checked-in `src/components/manuscript/ink.generated.json`. Edit the source drawing, rather than the generated coordinates.
- Keep the hero free of raster backgrounds, floating UI cards, surface borders, and decorative shadows. The open book is the visual focus; product screenshots belong in the sections below.
- Use restrained irregular pen lines and a few doubled binding strokes, rather than perfectly straight geometric contours. Pages use a warm ivory gradient (`#fffaf0` to `#f3ecdd`) and a low-opacity SVG fibre pattern; avoid raster grain and full-surface noise filters.
- The right page is an author's planning notebook: open sketch corners, a character portrait, motivation notes, a coastal thumbnail, and a three-beat story arc. These marks belong on the page, rather than in floating product UI.
- Show the book outline from the first frame. After a 120ms lead-in, draw the right-page study and timeline over 1,280ms, so the entire right page is filled at 1.4s; then draw the left-page chapter heading and prose over 3,800ms. The full sequence ends at 5.2s. SVG path order within each page defines pen order.
- Cache each animated path's geometry and page matrix once, reveal its normalized stroke, and map the pen position into root SVG coordinates. Use one finite animation frame loop, without React updates per frame. Rough.js runs only during asset generation and must not enter the browser bundle. Pointer tilt must stay subtle and apply to the whole book.
- The static and prerendered state is the complete illustration. Animate only after mounting; do not require browser globals during rendering or hide useful content pending JavaScript.
- Respect `prefers-reduced-motion`, including changes during playback: show complete strokes immediately, hide the pen, and disable pointer tilt. Motion must finish rather than loop indefinitely.
- Keep download, GitHub and documentation as three real link buttons. Download is the primary filled action; GitHub and documentation use a quiet outlined secondary style with equal height and visible focus. At 390px they share a row with 44px touch targets; the hero must not inherit the full-width mobile button treatment used by later sections.

## Documentation Experience

- The docs index should be organized by user journey, not by a flat list of modules.
- The sidebar keeps the registered manifest structure visible and includes local search.
- Document pages should include breadcrumb, GitHub source link, right-side table of contents, active heading highlight, and previous / next navigation.
- Long technical docs should use collapsible grouped TOC sections, markdown tables, and callout blocks for tips, warnings, and checkpoints.
- Flow diagrams should be concrete product workflow diagrams stored as SVG/PNG assets, not decorative illustrations.
- Search only indexes manifest-registered public documents. It must not expose internal wiki, plans, checkpoints, archive documents, or temporary task notes.
- Document category headings use semantic hierarchy: category title is the section heading, category description is supporting text, and each document card title is a lower-level heading.
- The screenshot wall in the home page console section should use a stable responsive grid, not floating overlapping images that break between tablet and desktop widths.

## Copy Rules

- Explain what users can do and what the system helps them finish.
- Avoid change-history wording such as "now", "previously", "migrated", or "upgraded".
- Prefer concrete production language: direction, world, character, chapter, review, repair, recovery.
