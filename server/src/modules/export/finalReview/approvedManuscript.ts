import { createHash } from "node:crypto";

export interface ManuscriptIdentity {
  novelId: string;
  epoch: number;
  title: string;
  description: string | null;
  target: number;
}
export function exportVersion(
  book: ManuscriptIdentity,
  rows: readonly { id: string; order: number; title: string; content: string | null }[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        book.novelId,
        book.epoch,
        book.title,
        book.description,
        book.target,
        rows.map((row) => [row.id, row.order, row.title, row.content]),
      ]),
    )
    .digest("hex");
}
