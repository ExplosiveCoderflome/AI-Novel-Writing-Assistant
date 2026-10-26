import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

/** Include canonical rows and version documents: either can be edited independently. */
export async function readWorkspaceFingerprint(
  db: Pick<Prisma.TransactionClient, "volumePlan" | "volumePlanVersion">,
  novelId: string,
): Promise<string> {
  const [versions, volumes] = await Promise.all([
    db.volumePlanVersion.findMany({ where: { novelId }, orderBy: { id: "asc" } }),
    db.volumePlan.findMany({ where: { novelId }, orderBy: { id: "asc" },
      include: { chapters: { orderBy: { id: "asc" } } } }),
  ]);
  return createHash("sha256").update(JSON.stringify({ versions, volumes })).digest("hex");
}
