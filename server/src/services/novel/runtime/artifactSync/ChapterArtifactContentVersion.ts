import { createHash } from "node:crypto";

/**
 * Stable identity for the finalized chapter text that artifact checkpoints
 * and read-side production projections can share without depending on an
 * extractor implementation.
 */
export function buildChapterArtifactContentHash(content: string): string {
  return createHash("sha256")
    .update(String(content).replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 24);
}
