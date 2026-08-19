# Contributing to VellumReel

Thank you for helping improve text-first narrative video production.

## Development

```bash
npm install
npm run check
npm run studio
```

Keep changes configuration-driven and avoid provider lock-in. New visual behavior should remain deterministic under Remotion rendering.

## Pull requests

- Explain the narrative or production problem being solved.
- Add or update tests for timing and text transformations.
- Run `npm run check` before opening a pull request.
- Do not commit credentials, signed URLs, personal manuscripts, generated voice assets, copyrighted book text, or large media files.
- Examples must be original, public domain, or explicitly licensed for redistribution.

## Design principles

1. Text and timing remain inspectable data.
2. Final audio drives the timeline.
3. A render is not complete until it has been validated.
4. Visual polish must not compromise subtitle readability.
5. Private content stays outside the reusable engine.
