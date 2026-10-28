import type {Prisma} from "@prisma/client";
import type {RunContract} from "../../../../modules/director";
import {readProductionBatchImplementation} from "../batch/binding";
import {productionKernelV2ChaptersEnabled} from "../batch/router";
import type {KernelModelPolicySources} from "../modelPolicy/source";
import {inspectProductionStorage, type StorageReader, type KernelReadiness} from "./storage";
import {inspectKernelModels, KernelReadinessError} from "./models";
export * from "./storage";
export {KernelReadinessError} from "./models";

export async function inspectKernelStartReadiness(db: StorageReader, contract: RunContract, sources?: KernelModelPolicySources): Promise<KernelReadiness> {
  const storage = await inspectProductionStorage(db, process.env.DATABASE_URL?.startsWith("postgres") ? "postgresql" : "sqlite");
  return storage.ready ? inspectKernelModels(contract, sources) : storage;
}
export async function assertKernelStartReadiness(db: StorageReader, contract: RunContract): Promise<void> {
  const result = await inspectKernelStartReadiness(db, contract);
  if (!result.ready) throw new KernelReadinessError(result.issues[0]);
}
/** Called inside prepareOpen, after idempotency replay and before paid preparation or openRun writes. */
export async function assertKernelOpenReadiness(db: StorageReader & Pick<Prisma.TransactionClient, "directorNextEvent">,
  contract: RunContract, deps: {enabled?: () => boolean; inspect?: typeof inspectKernelStartReadiness} = {}): Promise<void> {
  if (!contract.chapterRange || contract.stepIdsInScope && !contract.stepIdsInScope.includes("chapter_batch")) return;
  const binding = await readProductionBatchImplementation(db, contract);
  if (binding === "legacy" || binding !== "kernel" && !(deps.enabled ?? productionKernelV2ChaptersEnabled)()) return;
  const result = await (deps.inspect ?? inspectKernelStartReadiness)(db, contract);
  if (!result.ready) throw new KernelReadinessError(result.issues[0]);
}
