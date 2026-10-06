import { createHash } from "node:crypto";

export function artifactContentHash(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
