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
    <section className="space-y-4 rounded-xl border bg-background/95 p-4 shadow-sm">
      <div>
        <div className="text-lg font-semibold text-foreground">模型与运行方式</div>
        <div className={`mt-1 text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          确认模型和自动推进范围后，AI 会生成第一批整本书方向候选。
        </div>
      </div>

      <div className="rounded-xl border bg-background/70 p-3 sm:p-4">
        <div className="text-sm font-medium text-foreground">模型设置</div>
        <div className="mt-3">
          <LLMSelector />
        </div>
      </div>

      <div className="rounded-xl border bg-background/70 p-3 sm:p-4">
        <div className="text-sm font-medium text-foreground">自动导演运行方式</div>
        <div className="mt-3 rounded-lg border bg-muted/15 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">正文后去 AI 检测与修正</div>
              <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                开启后，章节正文生成完成时会检测 AI 味风险，并在命中可修正问题时生成修订稿。
              </div>
            </div>
            <Switch
              aria-label="正文后去 AI 检测与修正"
              checked={basicForm.postGenerationStyleReviewEnabled}
              onCheckedChange={(checked) => onBasicFormChange({ postGenerationStyleReviewEnabled: checked })}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {runModeOptions.map((option) => {
            const active = option.value === runMode;
            return (
              <button
                key={option.value}
                type="button"
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  option.recommended
                    ? active
                      ? "border-emerald-600 bg-emerald-50 shadow-sm ring-2 ring-emerald-500/25"
                      : "border-emerald-500/70 bg-emerald-50/80 shadow-sm ring-1 ring-emerald-500/20 hover:border-emerald-600"
                    : active
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-background hover:border-primary/40"
                }`}
                onClick={() => onRunModeChange(option.value)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{option.label}</div>
                  {option.recommended ? (
                    <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
                      推荐
                    </span>
                  ) : null}
                </div>
                <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  {option.description}
                </div>
                {option.recommendation ? (
                  <div className={`mt-2 rounded-md border border-emerald-500/30 bg-white/70 px-2 py-1.5 text-xs leading-5 text-emerald-900 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    {option.recommendation}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>

        {runMode === "auto_to_execution" ? (
          <>
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
          </>
        ) : null}
        {runMode === "full_book_autopilot" ? (
          <div className={`mt-3 rounded-md border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            <div className="text-sm font-medium text-foreground">全书自动成书</div>
            <div className="mt-1">
              系统会以整本书为目标完成规划、拆章、正文生成、审校和修复。只有模型不可用、服务异常、正文保护或不可恢复风险会停下。
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onBack}>返回世界与写法</Button>
        <Button type="button" onClick={onGenerate} disabled={!canGenerate}>
          {isGenerating ? "生成中..." : "开始生成方向"}
        </Button>
      </div>
    </section>
  );
}

