import type { StepContext, StepHandler, StepResult } from "../../application";

interface PlannedContract {
  id: string; chapterId?: string | null; chapterOrder: number;
  taskSheet?: string | null; sceneCards?: string | null;
  targetWordCount?: number | null; conflictLevel?: number | null; revealLevel?: number | null; mustAvoid?: string | null;
}
interface ContractWorkspace {novelId: string; volumes: readonly {id: string; chapters: readonly PlannedContract[]}[]}
interface SavedChapter {
  id: string; novelId: string; order: number; content: string | null;
  taskSheet: string | null; sceneCards: string | null;
  targetWordCount?: number | null; conflictLevel?: number | null; revealLevel?: number | null; mustAvoid?: string | null;
}
export interface ExecutionContractSyncInput<Document extends ContractWorkspace> {
  workspace: Document;
  executionRange: {startOrder: number; endOrder: number};
}
export interface ExecutionContractSyncDependencies<Document extends ContractWorkspace> {
  inputProvider: (context: StepContext) => Promise<ExecutionContractSyncInput<Document>>;
  volumeService: {
    syncVolumeChaptersWithOptions(novelId: string, input: {
      volumes: Document["volumes"]; preserveContent: true; applyDeletes: false;
      allowIncompleteExecutionContracts: false;
      executionContractChapterRange: {startOrder: number; endOrder: number};
    }, options: {emitEvent: false; syncPayoffLedger: false}): Promise<{clearContentCount: number; deleteCount: number}>;
  };
  chapterService: {listChapters(novelId: string): Promise<readonly SavedChapter[]>};
  contentHash: (content: unknown) => string;
}

function integrityStop(reason: string): StepResult {
  return {stopSignal: {kind: "data_integrity", reason}};
}

export function createExecutionContractSyncStepHandler<Document extends ContractWorkspace>(dependencies: ExecutionContractSyncDependencies<Document>): StepHandler {
  return async context => {
    const {workspace, executionRange} = await dependencies.inputProvider(context);
    const novelId = context.contract.novelId;
    if (workspace.novelId !== novelId) throw new Error("执行合同工作区不属于当前小说。");
    const {startOrder, endOrder} = executionRange;
    const authorized = context.contract.chapterRange;
    if (!Number.isSafeInteger(startOrder) || !Number.isSafeInteger(endOrder) || startOrder < 1 || endOrder < startOrder
      || (authorized && (startOrder < authorized.from || endOrder > authorized.to))) throw new Error("执行合同同步范围无效或超出授权范围。");
    const selected = workspace.volumes.flatMap(volume => volume.chapters)
      .filter(chapter => chapter.chapterOrder >= startOrder && chapter.chapterOrder <= endOrder)
      .sort((a,b) => a.chapterOrder-b.chapterOrder);
    if (selected.length !== endOrder-startOrder+1 || selected.some((chapter,index) => chapter.chapterOrder !== startOrder+index)) throw new Error("执行窗口缺少章节规划或存在重复顺序。");
    if (selected.some(chapter => !chapter.taskSheet?.trim() || !chapter.sceneCards?.trim())) throw new Error("执行窗口缺少已准备的任务单与场景计划。");
    const before = await dependencies.chapterService.listChapters(novelId);
    if (before.some(chapter => chapter.novelId !== novelId)) throw new Error("同步前的章节记录不属于当前小说。");
    // The existing service synchronizes the book's route metadata; this range limits execution-contract validation.
    const preview = await dependencies.volumeService.syncVolumeChaptersWithOptions(novelId, {
      volumes: workspace.volumes, preserveContent: true, applyDeletes: false,
      allowIncompleteExecutionContracts: false, executionContractChapterRange: executionRange,
    }, {emitEvent: false, syncPayoffLedger: false});
    if (preview.clearContentCount !== 0 || preview.deleteCount !== 0) return integrityStop("同步结果包含正文清除或章节删除，需检查保存结果。");
    const saved = await dependencies.chapterService.listChapters(novelId);
    if (saved.some(chapter => chapter.novelId !== novelId)) return integrityStop("同步后的章节记录不属于当前小说。");
    if (before.some(chapter => {
      const next = saved.find(row => row.id === chapter.id);
      return !next || next.content !== chapter.content;
    })) return integrityStop("执行合同同步未保留已有章节或正文，需检查数据完整性。");
    const contracts = [];
    for (const plan of selected) {
      const rows = saved.filter(chapter => chapter.order === plan.chapterOrder);
      const chapter = rows[0];
      if (rows.length !== 1 || !chapter || (plan.chapterId && chapter.id !== plan.chapterId)
        || chapter.taskSheet?.trim() !== plan.taskSheet?.trim() || chapter.sceneCards?.trim() !== plan.sceneCards?.trim()) {
        return integrityStop("目标章节执行合同未正确保存或与规划不一致。");
      }
      for (const key of ["targetWordCount", "conflictLevel", "revealLevel", "mustAvoid"] as const) {
        if (plan[key] !== undefined && (chapter[key] ?? null) !== (plan[key] ?? null)) return integrityStop("目标章节执行参数与保存的规划不一致。");
      }
      contracts.push({chapterId: chapter.id, chapterOrder: chapter.order, taskSheet: chapter.taskSheet, sceneCards: chapter.sceneCards,
        targetWordCount: chapter.targetWordCount ?? null, conflictLevel: chapter.conflictLevel ?? null,
        revealLevel: chapter.revealLevel ?? null, mustAvoid: chapter.mustAvoid ?? null});
    }
    return {artifact: {scope: context.contract.scope, status: "draft", protectedUserContent: false,
      contentRef: `chapter_execution_contract:${novelId}:${context.contract.scope}:${startOrder}-${endOrder}`,
      contentHash: dependencies.contentHash(contracts)}};
  };
}
