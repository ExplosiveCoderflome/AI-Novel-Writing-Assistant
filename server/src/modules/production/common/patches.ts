export interface TextPatch { before: string; after: string }
export type PatchFailureReason = "empty_anchor" | "missing_anchor" | "ambiguous_anchor" | "overlapping_patches";
export type PatchApplication =
  | { ok: true; content: string; changed: boolean }
  | { ok: false; content: string; reason: PatchFailureReason; patchIndex: number };

/** All anchors refer to the same original. Failed validation never returns a partial edit. */
export function applyTextPatches(original: string, patches: readonly TextPatch[]): PatchApplication {
  const located: Array<{ start: number; end: number; after: string; index: number }> = [];
  for (const [index, patch] of patches.entries()) {
    const fail = (reason: PatchFailureReason): PatchApplication => ({ ok: false, content: original, reason, patchIndex: index });
    if (!patch.before) return fail("empty_anchor");
    const start = original.indexOf(patch.before);
    if (start < 0) return fail("missing_anchor");
    // Advance one character so overlapping occurrences are also detected.
    if (original.indexOf(patch.before, start + 1) >= 0) return fail("ambiguous_anchor");
    located.push({ start, end: start + patch.before.length, after: patch.after, index });
  }
  located.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < located.length; index++) {
    if (located[index].start < located[index - 1].end) {
      return { ok: false, content: original, reason: "overlapping_patches", patchIndex: located[index].index };
    }
  }
  let content = original;
  for (const patch of located.reverse()) {
    content = content.slice(0, patch.start) + patch.after + content.slice(patch.end);
  }
  return { ok: true, content, changed: content !== original };
}
