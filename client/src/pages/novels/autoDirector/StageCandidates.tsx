import { useTranslation } from "react-i18next";
import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import NovelAutoDirectorCandidateBatches from "../components/NovelAutoDirectorCandidateBatches";
import NovelAutoDirectorProgressPanel from "../components/NovelAutoDirectorProgressPanel";
import { Button } from "@/components/ui/button";
import type { useAutoDirectorCreateController } from "./useAutoDirectorCreateController";
import NovelProductionExperienceHandoff from "../components/NovelProductionExperienceHandoff";
import OnboardingTip from "@/components/onboarding/OnboardingTip";

type AutoDirectorCreateController = ReturnType<typeof useAutoDirectorCreateController>;

interface StageCandidatesProps {
  controller: AutoDirectorCreateController;
  onRegenerateSettings: () => void;
}

export default function StageCandidates({
  controller,
  onRegenerateSettings,
}: StageCandidatesProps) {
  const { t } = useTranslation();
  if (
    controller.directorTask?.checkpointType === "production_experience_required"
    && controller.directorTask.resumeTarget?.novelId
  ) {
    return (
      <NovelProductionExperienceHandoff
        taskId={controller.directorTask.id}
        novelId={controller.directorTask.resumeTarget.novelId}
        novelTitle={controller.directorTask.title}
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
          onBackgroundContinue={controller.handleBackgroundContinue}
          onConfirmAndContinue={() => controller.continueMutation.mutate()}
          isConfirmingAndContinuing={controller.continueMutation.isPending}
          onOpenTaskCenter={controller.handleOpenTaskCenter}
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <OnboardingTip
        storageKey="auto-director-candidates"
        title={i18next.t("gen.pages.novels.autoDirector.StageCandidates.gen_5259d640", "这里只需要判断哪本书更想读")}
        description={i18next.t("gen.pages.novels.autoDirector.StageCandidates.gen_12f58e97", "重点比较主角欲望、核心冲突和持续爽点；标题与局部设定以后仍可调整。")}
        next={i18next.t("gen.pages.novels.autoDirector.StageCandidates.gen_0f53a2f8", "确认后，AI 会继续准备角色、世界和卷章资源。")}
      />
      <div className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="break-words text-2xl font-semibold leading-9 text-foreground [overflow-wrap:anywhere]">{i18next.t("gen.pages.novels.autoDirector.StageCandidates.gen_875c5ec8")}</div>
          <div className="mt-1 max-w-3xl break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{i18next.t("gen.pages.novels.autoDirector.StageCandidates.gen_af37f1c0", "先选最贴近你想法的一套方向；不满意时再展开调整或生成新一轮。")}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onRegenerateSettings}
        >{i18next.t("gen.pages.novels.autoDirector.StageCandidates.gen_470f9048", "回改设定")}</Button>
      </div>
      <NovelAutoDirectorCandidateBatches
        batches={controller.batches}
        selectedPresets={controller.selectedPresets}
        feedback={controller.feedback}
        onFeedbackChange={controller.setFeedback}
        onTogglePreset={controller.togglePreset}
        candidatePatchFeedbacks={controller.candidatePatchFeedbacks}
        onCandidatePatchFeedbackChange={(candidateId, value) => controller.setCandidatePatchFeedbacks((prev) => ({
          ...prev,
          [candidateId]: value,
        }))}
        titlePatchFeedbacks={controller.titlePatchFeedbacks}
        onTitlePatchFeedbackChange={(candidateId, value) => controller.setTitlePatchFeedbacks((prev) => ({
          ...prev,
          [candidateId]: value,
        }))}
        isGenerating={controller.generateMutation.isPending}
        isPatchingCandidate={controller.patchCandidateMutation.isPending}
        isRefiningTitle={controller.refineTitleMutation.isPending}
        isConfirming={controller.confirmMutation.isPending}
        onApplyCandidateTitleOption={controller.applyCandidateTitleOption}
        onPatchCandidate={(batchId, candidate, nextFeedback) => controller.patchCandidateMutation.mutate({
          batchId,
          candidate,
          feedback: nextFeedback,
        })}
        onRefineTitle={(batchId, candidate, nextFeedback) => controller.refineTitleMutation.mutate({
          batchId,
          candidate,
          feedback: nextFeedback,
        })}
        onConfirmCandidate={controller.handleConfirmCandidate}
        onGenerateNext={() => controller.generateMutation.mutate()}
      />
    </section>
  );
}

