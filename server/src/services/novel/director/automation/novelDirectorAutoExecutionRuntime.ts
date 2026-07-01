import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import { isFullBookAutopilotRunMode } from "@ai-novel/shared/types/novelDirector";
import { parsePipelinePayload } from "../../pipelineJobState";
import {
  buildDirectorAutoExecutionPausedLabel,
  buildDirectorAutoExecutionPausedSummary,
  buildDirectorAutoExecutionScopeLabelFromState,
  buildDirectorAutoExecutionDeferredQualityState,
  buildDirectorAutoExecutionPipelineOptions,
  resolveDirectorAutoExecutionRepairMode,
  resolveDirectorAutoExecutionWorkflowState,
  type DirectorAutoExecutionChapterRef,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";
import {
  recordCompletedCheckpoint,
  recordQualityRepairCheckpoint,
  resolveQualityRepairNoticeAction,
  syncAutoExecutionTaskState,
  type AutoExecutionResumeStage,
} from "./novelDirectorAutoExecutionCheckpointRuntime";
import { isSkippableAutoExecutionReviewFailure } from "./novelDirectorAutoExecutionFailure";
import {
  buildFailureCircuitBreaker,
  isDirectorCircuitBreakerOpen,
  resolveUsageCircuitBreaker,
  stopAutoExecutionForCircuitBreaker,
  withCircuitBreakerState,
} from "./novelDirectorAutoExecutionCircuitBreakerRuntime";
import {
  isNoChaptersToGenerateError,
  resolveSingleChapterExecutionRange,
  shouldClearAutoExecutionCheckpoint,
} from "./novelDirectorAutoExecutionRuntimeUtils";
import { prepareRequestedAutoExecution as prepareRequestedAutoExecutionState, resolveAutoExecutionRuntimeRangeAndState, shouldStopAutoExecution } from "./novelDirectorAutoExecutionRuntimePreparation";
import type { NovelDirectorAutoExecutionRuntimeDeps, PipelineJobSnapshot } from "./novelDirectorAutoExecutionRuntimePorts";
import { directorAutomationLedgerEventService } from "../runtime/DirectorAutomationLedgerEventService";
import {
  buildDirectorQualityLoopBudgetWindow,
  buildDirectorQualityLoopIssueSignature,
  findDirectorQualityLoopBudgetEntry,
  recordDirectorQualityLoopBudgetAttempt,
  resolveDirectorQualityLoopBudgetNextAction,
} from "../runtime/DirectorQualityLoopBudgetLedgerService";

export class NovelDirectorAutoExecutionRuntime {
  constructor(private readonly deps: NovelDirectorAutoExecutionRuntimeDeps) {}

  async prepareRequestedAutoExecution(
    input: Parameters<typeof prepareRequestedAutoExecutionState>[1],
  ) {
    return prepareRequestedAutoExecutionState(this.deps, input);
  }

  async runFromReady(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
    existingState?: DirectorAutoExecutionState | null;
    resumeCheckpointType?: "chapter_batch_ready" | "chapter_batch_ready" | "replan_required" | null;
    resumeStage?: AutoExecutionResumeStage;
    previousFailureMessage?: string | null;
    allowSkipReviewBlockedChapter?: boolean;
    approveAutoExecutionScope?: boolean;
    skipCurrentQualityRepair?: boolean;
  }): Promise<void> {
    const allowLazyChapterPlanning = isFullBookAutopilotRunMode(input.request.runMode);
    let { range, autoExecution, pipelineJobId } = await prepareRequestedAutoExecutionState(this.deps, {
      novelId: input.novelId,
      request: input.request,
      existingState: input.existingState,
      existingPipelineJobId: input.existingPipelineJobId,
      previousFailureMessage: input.previousFailureMessage,
      allowSkipReviewBlockedChapter: input.allowSkipReviewBlockedChapter,
    });
    let knownPipelineJob: PipelineJobSnapshot = null;
    if (pipelineJobId) {
      knownPipelineJob = await this.resolvePipelineJobForExecution(pipelineJobId);
      if (!knownPipelineJob || ["failed", "cancelled"].includes(knownPipelineJob.status)) {
        pipelineJobId = "";
        ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
          novelId: input.novelId,
          existingState: {
            ...autoExecution,
            pipelineJobId: null,
            pipelineStatus: null,
            circuitBreaker: null,
          },
          pipelineJobId: null,
          pipelineStatus: "queued",
          allowLazyChapterPlanning,
        }));
      }
    }
    if (isDirectorCircuitBreakerOpen(autoExecution.circuitBreaker)) {
      await stopAutoExecutionForCircuitBreaker(this.deps, {
        taskId: input.taskId,
        novelId: input.novelId,
        request: input.request,
        range,
        autoExecution,
        circuitBreaker: autoExecution.circuitBreaker,
        resumeStage: input.resumeStage,
      });
      return;
    }

    try {
      await syncAutoExecutionTaskState(this.deps, {
        taskId: input.taskId,
        novelId: input.novelId,
        request: input.request,
        range,
        autoExecution,
        isBackgroundRunning: true,
        resumeStage: input.resumeStage,
      });
      if (await shouldStopAutoExecution(this.deps, input.taskId, pipelineJobId || null)) {
        return;
      }

      if (pipelineJobId) {
        const existingJob = knownPipelineJob ?? await this.resolvePipelineJobForExecution(pipelineJobId);
        knownPipelineJob = existingJob;
        if (!existingJob || ["failed", "cancelled"].includes(existingJob.status)) {
          pipelineJobId = "";
        }
      }

      const activeRangeJob = await this.deps.novelService.findActivePipelineJobForRange(
        input.novelId,
        resolveSingleChapterExecutionRange(range, autoExecution).startOrder,
        resolveSingleChapterExecutionRange(range, autoExecution).endOrder,
        pipelineJobId || null,
      );
      if (activeRangeJob) {
        pipelineJobId = activeRangeJob.id;
        ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
          novelId: input.novelId,
          existingState: autoExecution,
          pipelineJobId,
          pipelineStatus: activeRangeJob.status,
          allowLazyChapterPlanning,
        }));
        await syncAutoExecutionTaskState(this.deps, {
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range,
          autoExecution,
          isBackgroundRunning: true,
          resumeStage: input.resumeStage,
        });
      }

      autoExecutionLoop:
      while (true) {
      if (!pipelineJobId) {
        ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
          novelId: input.novelId,
          existingState: autoExecution,
          pipelineJobId: null,
          pipelineStatus: "queued",
          allowLazyChapterPlanning,
        }));
        if ((autoExecution.remainingChapterCount ?? 0) === 0) {
          await recordCompletedCheckpoint(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            pipelineStatus: "succeeded",
          });
          return;
        }

        await this.deps.workflowService.markTaskRunning(input.taskId, {
          stage: "chapter_execution",
          itemKey: "chapter_execution",
          itemLabel: `正在自动执行${buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount)}`,
          progress: 0.93,
          clearCheckpoint: shouldClearAutoExecutionCheckpoint(input.resumeCheckpointType),
        });
        try {
          const job = await this.deps.novelService.startPipelineJob(
            input.novelId,
            buildDirectorAutoExecutionPipelineOptions({
              provider: input.request.provider,
              model: input.request.model,
              temperature: input.request.temperature,
              workflowTaskId: input.taskId,
              taskStyleProfileId: input.request.styleProfileId,
              controlAdvanceMode: isFullBookAutopilotRunMode(input.request.runMode)
                ? "full_book_autopilot"
                : "auto_to_execution",
              ...resolveSingleChapterExecutionRange(range, autoExecution),
              autoReview: autoExecution.autoReview,
              autoRepair: autoExecution.autoRepair,
              artifactSyncMode: autoExecution.artifactSyncMode,
              repairMode: resolveDirectorAutoExecutionRepairMode(autoExecution),
            }),
          );
          pipelineJobId = job.id;
          autoExecution = {
            ...autoExecution,
            pipelineJobId: job.id,
            pipelineStatus: job.status,
          };
        } catch (error) {
          if (!isNoChaptersToGenerateError(error)) {
            throw error;
          }
          ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
            novelId: input.novelId,
            existingState: autoExecution,
            pipelineJobId: null,
            pipelineStatus: "succeeded",
            allowLazyChapterPlanning,
          }));
          if ((autoExecution.remainingChapterCount ?? 0) === 0) {
            await recordCompletedCheckpoint(this.deps, {
              taskId: input.taskId,
              novelId: input.novelId,
              request: input.request,
              range,
              autoExecution,
              pipelineStatus: "succeeded",
            });
            return;
          }
          throw error;
        }
        await syncAutoExecutionTaskState(this.deps, {
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range,
          autoExecution,
          isBackgroundRunning: true,
          resumeStage: input.resumeStage,
        });
      }

      while (pipelineJobId) {
        if (await shouldStopAutoExecution(this.deps, input.taskId, pipelineJobId)) {
          return;
        }
        const job = await this.resolvePipelineJobForExecution(pipelineJobId);
        if (!job) {
          throw new Error("自动执行章节批次时未能找到对应的批量任务。");
        }
        if (job.status === "queued" || job.status === "running") {
          const runningState = resolveDirectorAutoExecutionWorkflowState(job, range, autoExecution);
          await this.deps.workflowService.markTaskRunning(input.taskId, {
            ...runningState,
            clearCheckpoint: shouldClearAutoExecutionCheckpoint(input.resumeCheckpointType),
          });
          ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
            novelId: input.novelId,
            existingState: autoExecution,
            pipelineJobId,
            pipelineStatus: job.status,
            allowLazyChapterPlanning,
          }));
          await syncAutoExecutionTaskState(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            isBackgroundRunning: true,
            resumeStage: "pipeline",
          });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
          novelId: input.novelId,
          existingState: autoExecution,
          pipelineJobId,
          pipelineStatus: job.status,
          allowLazyChapterPlanning,
        }));
        const usageCircuitBreaker = await resolveUsageCircuitBreaker({
          taskId: input.taskId,
          novelId: input.novelId,
          autoExecution,
        });
        if (usageCircuitBreaker) {
          autoExecution = withCircuitBreakerState(autoExecution, usageCircuitBreaker);
          if (isDirectorCircuitBreakerOpen(usageCircuitBreaker)) {
            await stopAutoExecutionForCircuitBreaker(this.deps, {
              taskId: input.taskId,
              novelId: input.novelId,
              request: input.request,
              range,
              autoExecution,
              circuitBreaker: usageCircuitBreaker,
              resumeStage: "pipeline",
            });
            return;
          }
          await syncAutoExecutionTaskState(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            isBackgroundRunning: true,
            resumeStage: "pipeline",
          });
        }

        if (job.status === "succeeded" && job.noticeSummary?.trim()) {
          const qualityIssueChapter = await this.resolveQualityIssueChapter(input.novelId, job);
          const noticeAction = await resolveQualityRepairNoticeAction(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            pipelineJobId,
            pipelineStatus: job.status,
            noticeCode: job.noticeCode,
            noticeSummary: job.noticeSummary.trim(),
            payload: job.payload,
            approveAutoExecutionScope: input.approveAutoExecutionScope,
            skipCurrentQualityRepair: input.skipCurrentQualityRepair,
            qualityIssueChapter,
          });
          if (noticeAction.action === "auto_continue") {
            pipelineJobId = "";
            ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
              novelId: input.novelId,
              existingState: noticeAction.checkpointState,
              pipelineJobId: null,
              pipelineStatus: "queued",
              allowLazyChapterPlanning,
            }));
            await syncAutoExecutionTaskState(this.deps, {
              taskId: input.taskId,
              novelId: input.novelId,
              request: input.request,
              range,
              autoExecution,
              isBackgroundRunning: true,
              resumeStage: "pipeline",
            });
            continue autoExecutionLoop;
          }

          await recordQualityRepairCheckpoint(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            pipelineJobId,
            pipelineStatus: job.status,
            checkpointType: noticeAction.checkpointType,
            pauseMessage: job.noticeSummary.trim(),
            qualityRepairRisk: noticeAction.qualityRepairRisk,
          });
          await syncAutoExecutionTaskState(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution: noticeAction.checkpointState,
            isBackgroundRunning: false,
            resumeStage: "pipeline",
          });
          return;
        }

        if (job.status === "succeeded") {
          const completedPipelineJobId = pipelineJobId;
          pipelineJobId = "";
          if ((autoExecution.remainingChapterCount ?? 0) > 0) {
            if (this.deps.autoConfirmPendingCandidates) {
              await this.deps.autoConfirmPendingCandidates(input.novelId).catch(() => null);
            }
            schedulePendingReviewAutoPromotionIfEnabled(this.deps, {
              novelId: input.novelId,
              taskId: input.taskId,
            });
            await syncAutoExecutionTaskState(this.deps, {
              taskId: input.taskId,
              novelId: input.novelId,
              request: input.request,
              range,
              autoExecution,
              isBackgroundRunning: true,
              resumeStage: "pipeline",
            });
            continue autoExecutionLoop;
          }
          await recordCompletedCheckpoint(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            pipelineJobId: completedPipelineJobId,
            pipelineStatus: job.status,
          });
          return;
        }

        if ((autoExecution.remainingChapterCount ?? 0) === 0) {
          await recordCompletedCheckpoint(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution,
            pipelineJobId,
            pipelineStatus: job.status,
          });
          return;
        }

        const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount);
        const failureMessage = job.error?.trim()
          || (job.status === "cancelled"
            ? `${scopeLabel}自动执行已取消。`
            : `${scopeLabel}自动执行未能全部通过质量要求。`);
        if (
          isFullBookAutopilotRunMode(input.request.runMode)
          && isSkippableAutoExecutionReviewFailure(failureMessage)
          && this.deps.resolveStateProposals
        ) {
          const resolution = await this.deps.resolveStateProposals({
            novelId: input.novelId,
            taskId: input.taskId,
            chapterId: autoExecution.nextChapterId ?? range.firstChapterId,
            chapterOrder: autoExecution.nextChapterOrder ?? null,
            runMode: input.request.runMode,
            provider: input.request.provider,
            model: input.request.model,
            temperature: input.request.temperature,
          });
          if (resolution.processed) {
            if (resolution.decision === "auto_replan_window" && this.deps.replanNovel) {
              await this.deps.replanNovel(input.novelId, {
                chapterId: autoExecution.nextChapterId ?? undefined,
                triggerType: "state_proposal_resolution",
                reason: resolution.reason ?? failureMessage,
                sourceIssueIds: resolution.proposalIds,
                windowSize: Math.max(1, resolution.affectedChapterWindow?.chapterOrders?.length ?? 1),
                provider: input.request.provider,
                model: input.request.model,
                temperature: input.request.temperature,
              });
            }
            pipelineJobId = "";
            ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
              novelId: input.novelId,
              existingState: {
                ...autoExecution,
                pipelineJobId: null,
                pipelineStatus: null,
              },
              pipelineJobId: null,
              pipelineStatus: "queued",
              allowLazyChapterPlanning,
            }));
            await syncAutoExecutionTaskState(this.deps, {
              taskId: input.taskId,
              novelId: input.novelId,
              request: input.request,
              range,
              autoExecution,
              isBackgroundRunning: true,
              resumeStage: "pipeline",
            });
            continue autoExecutionLoop;
          }
        }
        let budgetedAutoExecution = autoExecution;
        let qualityBudgetEntry: ReturnType<typeof recordDirectorQualityLoopBudgetAttempt>["entry"] | null = null;
        let qualityBudgetNextAction: ReturnType<typeof recordDirectorQualityLoopBudgetAttempt>["nextAction"] | null = null;
        if (job.status !== "cancelled" && autoExecution.autoRepair) {
          const pipelinePayload = parsePipelinePayload(job.payload);
          const affectedChapterWindow = buildDirectorQualityLoopBudgetWindow({
            autoExecution,
            chapterId: autoExecution.nextChapterId,
            chapterOrder: autoExecution.nextChapterOrder,
          });
          const issueSignature = buildDirectorQualityLoopIssueSignature({
            reason: failureMessage,
            noticeCode: job.noticeCode,
            repairMode: pipelinePayload.repairMode,
          });
          const existingBudgetEntry = findDirectorQualityLoopBudgetEntry({
            state: autoExecution,
            novelId: input.novelId,
            taskId: input.taskId,
            issueSignature,
            affectedChapterWindow,
          });
          const plannedBudgetAction = resolveDirectorQualityLoopBudgetNextAction(existingBudgetEntry);
          const budgetAttemptAction = plannedBudgetAction === "auto_rewrite_chapter"
            ? "chapter_rewrite"
            : plannedBudgetAction === "auto_replan_window"
              ? "window_replan"
              : plannedBudgetAction === "defer_and_continue"
                ? "defer_and_continue"
                : "patch_repair";
          const budgetResult = recordDirectorQualityLoopBudgetAttempt({
            state: autoExecution,
            novelId: input.novelId,
            taskId: input.taskId,
            issueSignature,
            affectedChapterWindow,
            action: budgetAttemptAction,
            reason: failureMessage,
            chapterId: autoExecution.nextChapterId,
            chapterOrder: autoExecution.nextChapterOrder,
          });
          budgetedAutoExecution = budgetResult.state;
          qualityBudgetEntry = budgetResult.entry;
          qualityBudgetNextAction = budgetResult.nextAction;
        }
        const failureCircuitBreaker = buildFailureCircuitBreaker({
          autoExecution: budgetedAutoExecution,
          jobStatus: job.status,
          message: failureMessage,
        });
        const failedAutoExecution = withCircuitBreakerState({
          ...budgetedAutoExecution,
          pipelineJobId,
          pipelineStatus: job.status,
        }, failureCircuitBreaker);
        if (autoExecution.autoRepair && job.status !== "cancelled") {
          const ledgerEventService = this.deps.automationLedgerEventService ?? directorAutomationLedgerEventService;
          await ledgerEventService.recordRepairTicketCreated({
            taskId: input.taskId,
            novelId: input.novelId,
            chapterId: autoExecution.nextChapterId ?? null,
            summary: failureMessage,
            failureCount: failureCircuitBreaker.patchFailureCount ?? failureCircuitBreaker.failureCount ?? 1,
            metadata: {
              pipelineJobId,
              pipelineStatus: job.status,
              chapterOrder: autoExecution.nextChapterOrder ?? null,
              qualityBudgetEntry,
              qualityBudgetNextAction,
            },
          }).catch(() => null);
        }
        if (
          (
            isDirectorCircuitBreakerOpen(failureCircuitBreaker)
            || qualityBudgetNextAction === "defer_and_continue"
          )
          && isFullBookAutopilotRunMode(input.request.runMode)
          && (failureCircuitBreaker.reason === "auto_repair_exhausted" || failureCircuitBreaker.reason === "replan_loop")
        ) {
          const deferredState = buildDirectorAutoExecutionDeferredQualityState({
            state: withCircuitBreakerState(failedAutoExecution, null),
            reason: failureMessage,
            source: failureCircuitBreaker.reason === "replan_loop" ? "replan_loop" : "repair_failure",
            chapter: await this.resolveQualityIssueChapter(input.novelId, job),
          });
          const ledgerEventService = this.deps.automationLedgerEventService ?? directorAutomationLedgerEventService;
          await ledgerEventService.recordEvent({
            type: "continue_with_risk",
            idempotencyKey: [
              input.taskId,
              input.novelId,
              autoExecution.nextChapterId ?? "unknown",
              autoExecution.nextChapterOrder ?? "unknown",
              failureCircuitBreaker.reason,
              failureCircuitBreaker.failureCount ?? "failure",
            ].join(":"),
            taskId: input.taskId,
            novelId: input.novelId,
            nodeKey: failureCircuitBreaker.nodeKey ?? "chapter_repair_node",
            summary: "全书自动成书已暂存本章质量问题，并继续推进后续章节。",
            affectedScope: autoExecution.nextChapterId
              ? `chapter:${autoExecution.nextChapterId}`
              : (typeof autoExecution.nextChapterOrder === "number" ? `chapter_order:${autoExecution.nextChapterOrder}` : null),
            severity: "medium",
            metadata: {
              decision: "defer_and_continue",
              circuitBreaker: failureCircuitBreaker,
              failureMessage,
              chapterOrder: autoExecution.nextChapterOrder ?? null,
              qualityBudgetEntry,
              qualityBudgetNextAction,
            },
          }).catch(() => null);
          const previousNextChapterId = autoExecution.nextChapterId ?? null;
          const previousNextChapterOrder = autoExecution.nextChapterOrder ?? null;
          pipelineJobId = "";
          ({ range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(this.deps, {
            novelId: input.novelId,
            existingState: deferredState,
            pipelineJobId: null,
            pipelineStatus: "queued",
            allowLazyChapterPlanning,
          }));
          const deferredWasPreserved = (
            autoExecution.nextChapterId !== previousNextChapterId
            || autoExecution.nextChapterOrder !== previousNextChapterOrder
            || (autoExecution.remainingChapterCount ?? 0) === 0
          );
          if (deferredWasPreserved) {
            await syncAutoExecutionTaskState(this.deps, {
              taskId: input.taskId,
              novelId: input.novelId,
              request: input.request,
              range,
              autoExecution,
              isBackgroundRunning: true,
              resumeStage: "pipeline",
            });
            continue autoExecutionLoop;
          }
        }
        if (isDirectorCircuitBreakerOpen(failureCircuitBreaker)) {
          await stopAutoExecutionForCircuitBreaker(this.deps, {
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            autoExecution: failedAutoExecution,
            circuitBreaker: failureCircuitBreaker,
            resumeStage: "pipeline",
          });
          return;
        }
        await this.deps.workflowService.markTaskFailed(input.taskId, failureMessage, {
          stage: "quality_repair",
          itemKey: "quality_repair",
          itemLabel: buildDirectorAutoExecutionPausedLabel(autoExecution),
          checkpointType: "chapter_batch_ready",
          checkpointSummary: buildDirectorAutoExecutionPausedSummary({
            scopeLabel,
            remainingChapterCount: autoExecution.remainingChapterCount ?? 0,
            nextChapterOrder: autoExecution.nextChapterOrder ?? null,
            failureMessage,
          }),
          chapterId: autoExecution.nextChapterId ?? range.firstChapterId,
          progress: 0.98,
        });
        await syncAutoExecutionTaskState(this.deps, {
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range,
          autoExecution: failedAutoExecution,
          isBackgroundRunning: false,
          resumeStage: "pipeline",
        });
        return;
      }
      return;
      }
    } catch (error) {
      throw error;
    }
  }

  private async resolvePipelineJobForExecution(jobId: string): Promise<PipelineJobSnapshot> {
    let job = await this.deps.novelService.getPipelineJobById(jobId);
    if (!job?.pendingManualRecovery) {
      return job;
    }
    await this.deps.novelService.resumePipelineJob(job.id);
    job = await this.deps.novelService.getPipelineJobById(job.id);
    return job;
  }

  private async resolveQualityIssueChapter(
    novelId: string,
    job: NonNullable<PipelineJobSnapshot>,
  ): Promise<DirectorAutoExecutionChapterRef | null> {
    const startOrder = typeof job.startOrder === "number" && Number.isFinite(job.startOrder)
      ? job.startOrder
      : null;
    const endOrder = typeof job.endOrder === "number" && Number.isFinite(job.endOrder)
      ? job.endOrder
      : null;
    if (startOrder == null || (endOrder != null && endOrder !== startOrder)) {
      return null;
    }
    const chapters = await this.deps.novelContextService.listChapters(novelId);
    return chapters.find((chapter) => chapter.order === startOrder) ?? null;
  }
}

export function schedulePendingReviewAutoPromotionIfEnabled(
  deps: Pick<
    NovelDirectorAutoExecutionRuntimeDeps,
    "isPendingReviewAutoPromotionEnabled" | "autoPromotePendingReviewProposals"
  >,
  input: {
    novelId: string;
    taskId: string;
  },
): void {
  if (!deps.isPendingReviewAutoPromotionEnabled || !deps.autoPromotePendingReviewProposals) {
    return;
  }
  void Promise.resolve(deps.isPendingReviewAutoPromotionEnabled())
    .then((enabled) => {
      if (!enabled) {
        return undefined;
      }
      return deps.autoPromotePendingReviewProposals?.(input);
    })
    .catch(() => null);
}

