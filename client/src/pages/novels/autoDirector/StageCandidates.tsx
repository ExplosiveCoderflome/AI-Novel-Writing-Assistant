import NovelAutoDirectorCandidateBatches from "../components/NovelAutoDirectorCandidateBatches";
import NovelAutoDirectorProgressPanel from "../components/NovelAutoDirectorProgressPanel";
import { Button } from "@/components/ui/button";
import type { useAutoDirectorCreateController } from "./useAutoDirectorCreateController";
import NovelProductionExperienceHandoff from "../components/NovelProductionExperienceHandoff";
import type { CandidateSelection } from "./candidateReview/useCandidateSelection";
import { isProductionExperienceChoicePending } from "@/lib/novelRoutes";

type AutoDirectorCreateController = ReturnType<typeof useAutoDirectorCreateController>;

interface StageCandidatesProps {
  controller: AutoDirectorCreateController;
  selection: CandidateSelection;
  isApplying: boolean;
  onRegenerateSettings: () => void;
}

export default function StageCandidates({
  controller,
  selection,
  isApplying,
  onRegenerateSettings,
}: StageCandidatesProps) {
  const directorTask = controller.directorTask;
  const openingMode = controller.directorVersion === "v2" && (controller.runMode === "stage_review" || controller.runMode === "auto_to_ready")
    ? controller.runMode : undefined;
  if (
    directorTask
    && isProductionExperienceChoicePending(directorTask)
    && directorTask.resumeTarget?.novelId
  ) {
    return (
      <NovelProductionExperienceHandoff
        taskId={directorTask.id}
        novelId={directorTask.resumeTarget.novelId}
        novelTitle={directorTask.title}
      />
    );
  }

  if (controller.dialogMode !== "candidate_selection") {
    return (
      <section className="space-y-4">
        <NovelAutoDirectorProgressPanel
          mode={controller.dialogMode}
          task={controller.directorTask}
          taskId={controller.workflowTaskId}
          titleHint={controller.pendingTitleHint}
          fallbackError={controller.executionError}
          onConfirmAndContinue={() => controller.continueMutation.mutate()}
          isConfirmingAndContinuing={controller.continueMutation.isPending}
          quickRetryLabel="快速重试"
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold leading-9">方向候选</h2>
          <div className="mt-1 max-w-3xl break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {openingMode
              ? "比较方向后，可以让 AI 自动准备开书，也可以逐阶段讨论并确认角色、卷纲和章节。"
              : "可以逐套比较故事。选定方向后，AI 会继续准备角色、世界和卷章。"}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onRegenerateSettings}
        >
          回改设定
        </Button>
      </div>
      <NovelAutoDirectorCandidateBatches
        batches={controller.batches}
        openingMode={openingMode}
        discussionKey={controller.workflowTaskId ? selection.active?.key : undefined}
        titlePatchFeedbacks={controller.titlePatchFeedbacks}
        onTitlePatchFeedbackChange={(candidateId, value) => controller.setTitlePatchFeedbacks((prev) => ({
          ...prev,
          [candidateId]: value,
        }))}
        isRefiningTitle={controller.refineTitleMutation.isPending}
        isConfirming={controller.confirmMutation.isPending}
        isApplying={isApplying}
        onApplyCandidateTitleOption={controller.applyCandidateTitleOption}
        onRefineTitle={(batchId, candidate, nextFeedback) => controller.refineTitleMutation.mutate({
          batchId,
          candidate,
          feedback: nextFeedback,
        })}
        onConfirmCandidate={controller.handleConfirmCandidate}
      />
    </section>
  );
}

