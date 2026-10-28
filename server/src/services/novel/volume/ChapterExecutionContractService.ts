import type { Prisma } from "@prisma/client";
import { runVolumeWorkspaceTransaction } from "./volumeWorkspacePersistence";
import { prepareExecutionContract, evaluateExecutionContract, commitExecutionContract,
  type ChapterExecutionContractServiceDeps, type ChapterContractPreparationPorts,
  type EnsureChapterExecutionContractOptions, type PreparedChapterExecutionContract,
  type EvaluatedChapterExecutionContract, type ContractTransactionFence } from "./executionContract";
export type { ChapterExecutionContractServiceDeps, ChapterContractPreparationPorts, PreparedChapterExecutionContract,
  EvaluatedChapterExecutionContract, ContractTransactionFence } from "./executionContract";
export { prepareChapterContractGeneration, executePreparedChapterContractGeneration, readExecutionContractWorkspace } from "./executionContract";
export type { PreparedChapterContractGeneration } from "./executionContract";
const chapterExecutionContractFlights = new Map<string, Promise<unknown>>();

export function runChapterExecutionContractSingleflight<T>(
  novelId: string,
  chapterId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = `${novelId}:${chapterId}`;
  const active = chapterExecutionContractFlights.get(key);
  if (active) {
    return active as Promise<T>;
  }
  const pending = work().finally(() => {
    if (chapterExecutionContractFlights.get(key) === pending) {
      chapterExecutionContractFlights.delete(key);
    }
  });
  chapterExecutionContractFlights.set(key, pending);
  return pending;
}


export class ChapterExecutionContractService {
  constructor(private readonly deps: ChapterExecutionContractServiceDeps) {}
  async ensureChapterExecutionContract(novelId: string, chapterId: string, options: EnsureChapterExecutionContractOptions = {}) {
    return runChapterExecutionContractSingleflight(novelId, chapterId, async () => {
      const prepared = await prepareExecutionContract(novelId, chapterId, options, this.deps);
      const outcome = await evaluateExecutionContract(prepared, options, this.deps);
      if (outcome.kind === "reuse") return { ...prepared.chapter, styleContract: outcome.styleContract };
      const saved = await runVolumeWorkspaceTransaction(tx => commitExecutionContract(tx, prepared, outcome, this.deps));
      this.deps.emitVolumeUpdated(novelId, "chapter_execution_contract_refined");
      return saved;
    });
  }
  prepareChapterExecutionContract(novelId: string, chapterId: string, options: EnsureChapterExecutionContractOptions, ports: ChapterContractPreparationPorts) {
    return prepareExecutionContract(novelId, chapterId, options, this.deps, ports);
  }
  evaluatePreparedChapterExecutionContract(prepared: PreparedChapterExecutionContract, options: EnsureChapterExecutionContractOptions, ports: ChapterContractPreparationPorts) {
    return evaluateExecutionContract(prepared, options, this.deps, ports);
  }
  commitPreparedChapterExecutionContract(tx: Prisma.TransactionClient, prepared: PreparedChapterExecutionContract,
    outcome: EvaluatedChapterExecutionContract, assertTransaction: ContractTransactionFence) {
    if (typeof assertTransaction !== "function") throw new Error("Execution contract commit requires a transaction fence");
    return commitExecutionContract(tx, prepared, outcome, this.deps, assertTransaction);
  }
}
