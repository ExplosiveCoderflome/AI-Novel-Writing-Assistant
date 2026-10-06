import {FactIntegrityError, type RunStatus} from "../domain";
import {UnknownPlanVersionError, type ProjectionService} from "./projectionService";
import type {RunRepository} from "./ports";

export interface DirectorReadOnlyRecord {
  runId: string;
  novelId: string;
  statusLabel: string;
  headline: string;
  detail: string | null;
  progressLabel: string;
  sourceRoute: string;
  directorRoute: string;
}

const STATUS_LABELS: Readonly<Record<RunStatus, string>> = {
  queued: "等待开始", running: "推进中", waiting_gate: "等待确认", paused: "暂停中",
  completed: "已完成", failed: "中断", cancelled: "已取消",
};

/** Read-only history can retain saved identity when the artifact facts cannot be projected. */
export class RecordProjection {
  constructor(private readonly deps: {
    projectionService: Pick<ProjectionService, "get">;
    runRepository: Pick<RunRepository, "getContract" | "getControl">;
  }) {}

  async get(runId: string): Promise<DirectorReadOnlyRecord> {
    try {
      const view = await this.deps.projectionService.get(runId);
      return {
        runId, novelId: view.novelId, statusLabel: STATUS_LABELS[view.mode], headline: view.headline,
        detail: view.detail, progressLabel: `${view.progress.done}/${view.progress.total} 个阶段完成`,
        sourceRoute: view.sourceRoute, directorRoute: `/lab/director/${encodeURIComponent(view.novelId)}`,
      };
    } catch (error) {
      if (!(error instanceof FactIntegrityError) && !(error instanceof UnknownPlanVersionError)) throw error;
      const [contract, control] = await Promise.all([
        this.deps.runRepository.getContract(runId), this.deps.runRepository.getControl(runId),
      ]);
      if (!contract || contract.runId !== runId || typeof contract.novelId !== "string" || !contract.novelId.trim()
        || !control || !Object.hasOwn(STATUS_LABELS, control.status)) throw error;
      const sourceRoute = `/lab/director/${encodeURIComponent(contract.novelId)}`;
      return {
        runId, novelId: contract.novelId, statusLabel: STATUS_LABELS[control.status],
        headline: "创作结果需要检查",
        detail: control.pause?.reason ?? "请从本书创作页查看并处理保存结果。",
        progressLabel: "创作进度暂时无法读取", sourceRoute, directorRoute: sourceRoute,
      };
    }
  }
}
