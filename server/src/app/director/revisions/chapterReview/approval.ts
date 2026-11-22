import type { VolumeChapterPlan, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { artifactContentHash, type RunContract, type StepContext } from "../../../../modules/director";
import { prisma } from "../../../../db/prisma";

type Plan = Pick<
  VolumeChapterPlan,
  | "id"
  | "volumeId"
  | "chapterOrder"
  | "taskSheet"
  | "sceneCards"
  | "targetWordCount"
  | "mustAvoid"
  | "conflictLevel"
  | "revealLevel"
>;
export function canApproveProse(contract: RunContract) {
  const allowed = contract.stepIdsInScope;
  return Boolean(
    contract.chapterRange &&
    contract.driver === "assisted" &&
    (!allowed || (allowed.includes("execution_contract_sync") && allowed.includes("chapter_batch"))),
  );
}
export function chapterApprovalFingerprint(versionId: string, rows: readonly Plan[]) {
  return artifactContentHash([
    versionId,
    [...rows]
      .sort((a, b) => a.chapterOrder - b.chapterOrder)
      .map((row) => [
        row.id,
        row.volumeId,
        row.chapterOrder,
        row.taskSheet,
        row.sceneCards,
        row.targetWordCount ?? null,
        row.mustAvoid ?? null,
        row.conflictLevel ?? null,
        row.revealLevel ?? null,
      ]),
  ]);
}

/** A new gate decision supersedes any earlier approval, including explicit regeneration. */
export async function matchesApprovedChapterPlans(context: StepContext, workspace: VolumePlanDocument) {
  const range = context.contract.chapterRange;
  if (!canApproveProse(context.contract) || context.regeneration || !range || !workspace.activeVersionId) return false;
  const latest = await prisma.directorNextCommand.findMany({
    where: { runId: context.runId, type: "resolve_gate" },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { resultJson: true, createdAt: true },
  });
  if (!latest[0]?.resultJson || latest[0].createdAt.getTime() === latest[1]?.createdAt.getTime()) return false;
  const approval = JSON.parse(latest[0].resultJson) as { approvedChapterFingerprint?: string };
  if (!approval.approvedChapterFingerprint) return false;
  const selected = workspace.volumes
    .flatMap((volume) => volume.chapters)
    .filter((row) => row.chapterOrder >= range.from && row.chapterOrder <= range.to);
  // Sync normalizes optional text; a legacy row needing normalization gets its own execution review.
  if (
    selected.some((row) =>
      [row.taskSheet, row.sceneCards, row.mustAvoid].some(
        (value) => value != null && (!value || value !== value.trim()),
      ),
    )
  )
    return false;
  return chapterApprovalFingerprint(workspace.activeVersionId, selected) === approval.approvedChapterFingerprint;
}
