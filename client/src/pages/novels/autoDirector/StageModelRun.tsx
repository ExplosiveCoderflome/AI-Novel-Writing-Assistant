import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { DirectorRunMode } from "@ai-novel/shared/types/novelDirector";
import type {
  DirectorAutoApprovalGroup,
  DirectorAutoApprovalPoint,
} from "@ai-novel/shared/types/autoDirectorApproval";
import LLMSelector from "@/components/common/LLMSelector";
import AutoDirectorApprovalStrategyPanel from "@/components/autoDirector/AutoDirectorApprovalStrategyPanel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import type { DirectorRunModeOption } from "../components/NovelAutoDirectorDialog.shared";
import {
  type DirectorAutoExecutionDraftState,
  DirectorAutoExecutionPlanFields,
} from "../components/directorAutoExecutionPlan.shared";

interface StageModelRunProps {
  basicForm: NovelBasicFormState;
  onBasicFormChange: (patch: Partial<NovelBasicFormState>) => void;
  runMode: DirectorRunMode;
  runModeOptions: DirectorRunModeOption[];
  onRunModeChange: (value: DirectorRunMode) => void;
  autoExecutionDraft: DirectorAutoExecutionDraftState;
  onAutoExecutionDraftChange: (patch: Partial<DirectorAutoExecutionDraftState>) => void;
  autoApprovalEnabled: boolean;
  autoApprovalCodes: string[];
  autoApprovalGroups?: DirectorAutoApprovalGroup[];
  autoApprovalPoints?: DirectorAutoApprovalPoint[];
  onAutoApprovalEnabledChange: (enabled: boolean) => void;
  onAutoApprovalCodesChange: (next: string[]) => void;
  canGenerate: boolean;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}

export default function StageModelRun({
  basicForm,
  onBasicFormChange,
  runMode,
  runModeOptions,
  onRunModeChange,
  autoExecutionDraft,
  onAutoExecutionDraftChange,
  autoApprovalEnabled,
  autoApprovalCodes,
  autoApprovalGroups,
  autoApprovalPoints,
  onAutoApprovalEnabledChange,
  onAutoApprovalCodesChange,
  canGenerate,
  isGenerating,
  onBack,
  onGenerate,
}: StageModelRunProps) {
  return (
    <section className="mx-auto w-full max-w-5xl space-y-7 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-normal text-foreground">{t("gen.pages.novels.autoDirector.StageModelRun.gen_5965218f")}</div>
          <div className={`mt-2 max-w-2xl text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            选择这次要用的模型和自动化范围。确认后，AI 会生成第一批整本书方向候选。
          </div>
        </div>
        <div className="rounded-full bg-muted/55 px-3 py-1 text-xs text-muted-foreground">
          启动前最后一步
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.autoDirector.StageModelRun.gen_5f0c896e")}</div>
            <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              第一次使用建议先生成方向和前置规划，确认路子对了再扩大自动执行范围。
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {runModeOptions.map((option) => {
              const active = option.value === runMode;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-lg px-4 py-4 text-left transition ring-1 ${
                    active
                      ? "bg-foreground text-background ring-foreground shadow-sm"
                      : "bg-muted/30 text-foreground ring-border/20 hover:bg-muted/50"
                  }`}
                  onClick={() => onRunModeChange(option.value)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">{option.label}</div>
                    {option.recommended ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        active ? "bg-background/15 text-background" : "bg-background text-muted-foreground"
                      }`}>
                        推荐
                      </span>
                    ) : null}
                  </div>
                  <div className={`mt-2 text-xs leading-5 ${active ? "text-background/70" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    {option.description}
                  </div>
                  {option.recommendation ? (
                    <div className={`mt-3 text-xs leading-5 ${active ? "text-background/75" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                      建议：{option.recommendation}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          {runMode === "auto_to_execution" ? (
            <div className="space-y-4 pt-2">
              <div>
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.autoDirector.StageModelRun.gen_6a9aa3df")}</div>
                <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  只在你选择按范围执行时生效，用来控制 AI 直接推进到哪里。
                </div>
              </div>
              <DirectorAutoExecutionPlanFields
                draft={autoExecutionDraft}
                onChange={onAutoExecutionDraftChange}
                usage="new_book"
                maxChapterCount={basicForm.estimatedChapterCount}
              />
              <AutoDirectorApprovalStrategyPanel
                enabled={autoApprovalEnabled}
                approvalPointCodes={autoApprovalCodes}
                groups={autoApprovalGroups}
                approvalPoints={autoApprovalPoints}
                onEnabledChange={onAutoApprovalEnabledChange}
                onApprovalPointCodesChange={onAutoApprovalCodesChange}
              />
            </div>
          ) : null}
          {runMode === "full_book_autopilot" ? (
            <div className={`space-y-1 pt-2 text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              <div className="font-medium text-foreground">{t("gen.pages.novels.autoDirector.StageModelRun.gen_6a1d99e4")}</div>
              <div>
                系统会以整本书为目标完成规划、拆章、正文生成、审校和修复。只有模型不可用、服务异常、正文保护或不可恢复风险会停下。
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.autoDirector.StageModelRun.gen_9c8d9efd")}</div>
            <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              开启后，章节正文生成完成时会检测 AI 味风险，并在命中可修正问题时生成修订稿。
            </div>
          </div>
          <Switch
            aria-label={t("gen.pages.novels.autoDirector.StageModelRun.gen_9c8d9efd")}
            checked={basicForm.postGenerationStyleReviewEnabled}
            onCheckedChange={(checked) => onBasicFormChange({ postGenerationStyleReviewEnabled: checked })}
          />
        </div>

        <details className="group pt-1">
          <summary className="cursor-pointer list-none">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.autoDirector.StageModelRun.gen_96467e71")}</div>
            <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              默认使用顶部已选模型；需要临时换模型时再展开调整。
            </div>
          </summary>
          <div className="mt-4">
            <LLMSelector />
          </div>
        </details>
      </div>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>{t("gen.pages.novels.autoDirector.StageModelRun.gen_1272a114")}</Button>
        <Button type="button" onClick={onGenerate} disabled={!canGenerate}>
          {isGenerating ? t("gen.pages.novels.autoDirector.StageModelRun.gen_4d020ba3") : t("gen.pages.novels.autoDirector.StageModelRun.gen_b21c2a02")}
        </Button>
      </div>
    </section>
  );
}
