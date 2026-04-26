import type { DirectorRunMode } from "@ai-novel/shared/types/novelDirector";
import type {
  DirectorAutoApprovalGroup,
  DirectorAutoApprovalPoint,
} from "@ai-novel/shared/types/autoDirectorApproval";
import type { StyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import LLMSelector from "@/components/common/LLMSelector";
import AutoDirectorApprovalStrategyPanel from "@/components/autoDirector/AutoDirectorApprovalStrategyPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import {
  BASIC_INFO_FIELD_HINTS,
  DEFAULT_ESTIMATED_CHAPTER_COUNT,
  EMOTION_OPTIONS,
  PACE_OPTIONS,
  POV_OPTIONS,
} from "../novelBasicInfo.shared";
import {
  type DirectorAutoExecutionDraftState,
  DirectorAutoExecutionPlanFields,
} from "./directorAutoExecutionPlan.shared";
import { BookFramingQuickFillButton } from "./basicInfoForm/BookFramingQuickFillButton";
import { BookFramingSection } from "./basicInfoForm/BookFramingSection";
import {
  FieldLabel,
  findOptionSummary,
} from "./basicInfoForm/BasicInfoFormPrimitives";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface RunModeOption {
  value: DirectorRunMode;
  label: string;
  description: string;
}

interface GenreOption {
  id: string;
  path: string;
  label: string;
}

interface NovelAutoDirectorSetupPanelProps {
  basicForm: NovelBasicFormState;
  genreOptions: GenreOption[];
  idea: string;
  onIdeaChange: (value: string) => void;
  runMode: DirectorRunMode;
  runModeOptions: RunModeOption[];
  onRunModeChange: (value: DirectorRunMode) => void;
  autoExecutionDraft: DirectorAutoExecutionDraftState;
  onAutoExecutionDraftChange: (patch: Partial<DirectorAutoExecutionDraftState>) => void;
  maxChapterCount?: number | null;
  autoApprovalEnabled: boolean;
  autoApprovalCodes: string[];
  autoApprovalGroups?: DirectorAutoApprovalGroup[];
  autoApprovalPoints?: DirectorAutoApprovalPoint[];
  onAutoApprovalEnabledChange: (enabled: boolean) => void;
  onAutoApprovalCodesChange: (next: string[]) => void;
  styleProfileOptions: Array<{ id: string; name: string }>;
  selectedStyleProfileId: string;
  selectedStyleSummary: StyleIntentSummary | null;
  onStyleProfileChange: (value: string) => void;
  onBasicFormChange?: (patch: Partial<NovelBasicFormState>) => void;
  canGenerate: boolean;
  isGenerating: boolean;
  batchCount: number;
  onGenerate: () => void;
}

export default function NovelAutoDirectorSetupPanel(props: NovelAutoDirectorSetupPanelProps) {
  const {
    basicForm,
    genreOptions,
    idea,
    onIdeaChange,
    runMode,
    runModeOptions,
    onRunModeChange,
    autoExecutionDraft,
    onAutoExecutionDraftChange,
    maxChapterCount,
    autoApprovalEnabled,
    autoApprovalCodes,
    autoApprovalGroups,
    autoApprovalPoints,
    onAutoApprovalEnabledChange,
    onAutoApprovalCodesChange,
    styleProfileOptions,
    selectedStyleProfileId,
    selectedStyleSummary,
    onStyleProfileChange,
    onBasicFormChange,
    canGenerate,
    isGenerating,
    batchCount,
    onGenerate,
  } = props;

  const hasEditableBasicForm = typeof onBasicFormChange === "function";

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-background/80 p-3 sm:p-4">
      <div className="text-sm font-medium text-foreground">你的起始想法</div>
      <textarea
        className="mt-2 min-h-[128px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        value={idea}
        onChange={(event) => onIdeaChange(event.target.value)}
        placeholder="例如：普通女大学生误入异能组织，一边上学打工，一边调查父亲失踪真相。"
      />

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0 space-y-4">
          {hasEditableBasicForm ? (
            <section className="min-w-0 rounded-xl border bg-muted/20 p-3 sm:p-4">
              <div className="text-sm font-medium text-foreground">导演起始设置</div>
              <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                这里只保留自动导演真正需要你快速确认的参数。先保持默认也可以，只有你明确想要某种手感时再调整。
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel htmlFor="director-basic-pov" hint={BASIC_INFO_FIELD_HINTS.narrativePov}>叙事视角</FieldLabel>
                  <select
                    id="director-basic-pov"
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={basicForm.narrativePov}
                    onChange={(event) => onBasicFormChange({
                      narrativePov: event.target.value as NovelBasicFormState["narrativePov"],
                    })}
                  >
                    {POV_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{findOptionSummary(POV_OPTIONS, basicForm.narrativePov)}</div>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="director-basic-pace" hint={BASIC_INFO_FIELD_HINTS.pacePreference}>节奏偏好</FieldLabel>
                  <select
                    id="director-basic-pace"
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={basicForm.pacePreference}
                    onChange={(event) => onBasicFormChange({
                      pacePreference: event.target.value as NovelBasicFormState["pacePreference"],
                    })}
                  >
                    {PACE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{findOptionSummary(PACE_OPTIONS, basicForm.pacePreference)}</div>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="director-basic-emotion" hint={BASIC_INFO_FIELD_HINTS.emotionIntensity}>情绪浓度</FieldLabel>
                  <select
                    id="director-basic-emotion"
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={basicForm.emotionIntensity}
                    onChange={(event) => onBasicFormChange({
                      emotionIntensity: event.target.value as NovelBasicFormState["emotionIntensity"],
                    })}
                  >
                    {EMOTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{findOptionSummary(EMOTION_OPTIONS, basicForm.emotionIntensity)}</div>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="director-basic-estimated" hint={BASIC_INFO_FIELD_HINTS.estimatedChapterCount}>预计章节数</FieldLabel>
                  <Input
                    id="director-basic-estimated"
                    type="number"
                    min={1}
                    max={2000}
                    value={basicForm.estimatedChapterCount}
                    onChange={(event) => onBasicFormChange({
                      estimatedChapterCount: Math.max(
                        1,
                        Math.min(2000, Number(event.target.value || 0) || DEFAULT_ESTIMATED_CHAPTER_COUNT),
                      ),
                    })}
                  />
                  <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    会作为整书结构密度和后续卷章规划的参考，不是硬性上限。
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <FieldLabel htmlFor="director-basic-style-profile" hint="可选。选定后，导演前半段会只读取轻量写法摘要，正文阶段再继续使用完整写法规则。">
                    书级默认写法
                  </FieldLabel>
                  <select
                    id="director-basic-style-profile"
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={selectedStyleProfileId}
                    onChange={(event) => onStyleProfileChange(event.target.value)}
                  >
                    <option value="">先只用文风关键词</option>
                    {styleProfileOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                  <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    {selectedStyleSummary?.stageSummaryLines[0] ?? "有沉淀好的写法资产时，建议直接选一套，帮助你更清楚地预期导演会怎样写。"}
                  </div>
                  {selectedStyleSummary?.stageSummaryLines.length ? (
                    <div className={`rounded-xl border bg-muted/15 p-3 text-xs leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                      本阶段仅生效的写法摘要：{selectedStyleSummary.stageSummaryLines.join("；")}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {hasEditableBasicForm ? (
            <BookFramingSection
              basicForm={basicForm}
              onFormChange={onBasicFormChange}
              quickFill={(
                <BookFramingQuickFillButton
                  basicForm={basicForm}
                  genreOptions={genreOptions}
                  descriptionOverride={idea}
                  onApplySuggestion={onBasicFormChange}
                />
              )}
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <section className="min-w-0 rounded-xl border bg-background/70 p-3 sm:p-4">
            <div className="text-sm font-medium text-foreground">模型设置</div>
            <div className="mt-3">
              <LLMSelector />
            </div>
          </section>

          <section className="min-w-0 rounded-xl border bg-background/70 p-3 sm:p-4">
            <div className="text-sm font-medium text-foreground">自动导演运行方式</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              {runModeOptions.map((option) => {
                const active = option.value === runMode;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                    onClick={() => onRunModeChange(option.value)}
                  >
                    <div className="text-sm font-medium text-foreground">{option.label}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</div>
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
                  maxChapterCount={maxChapterCount}
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
          </section>

          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.actionRow}>
            <Button type="button" className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} onClick={onGenerate} disabled={!canGenerate}>
              {isGenerating
                ? "生成中..."
                : batchCount === 0
                  ? "生成第一批方案"
                  : "按修正建议继续生成"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
