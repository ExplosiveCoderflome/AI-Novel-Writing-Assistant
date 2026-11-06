# Hero round 2

Completed on `feat/site-hero` in `C:\code\anw-site`.

- Added seeded Rough.js pen work for the book, character study, story arc and manuscript. Geometry is generated before dev/build and checked in; Rough.js stays outside the browser bundle.
- Warm ivory pages use a subtle SVG fibre pattern. The right page fills progressively by 1.4s; the left chapter follows, ending the finite sequence at 5.2s.
- Restored GitHub and Docs as secondary link buttons beside download, with compact mobile spacing, 44px touch targets and visible keyboard focus.
- Preserved complete prerendered artwork, reduced-motion support (including preference changes), and fine-pointer-only tilt. Animation uses one frame loop and cached geometry.
- Updated `site/DESIGN.md`, the existing site wiki, release notes and README latest update.

Validation: `pnpm --filter site build` passed (TypeScript, Vite, 38 prerendered routes). Seeded generation reproduced identical output; SVG coordinates and static HTML/button structure checks passed. Browser JS grows about 1% versus the existing local build, with no Rough.js runtime, texture downloads or noise filters. Vite still reports the large main chunk warning.

Per repository rules, browser/visual and runtime performance verification is left to the user, including 390px layout acceptance and reduced-motion playback. Existing `hero2-prompt.md` and `hero2.log` were left untouched.
