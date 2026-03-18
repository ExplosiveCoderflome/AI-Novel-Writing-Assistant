import type { ReactNode } from "react";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AI_FREEDOM_OPTIONS,
  BASIC_INFO_FIELD_HINTS,
  EMOTION_OPTIONS,
  PACE_OPTIONS,
  POV_OPTIONS,
  PROJECT_MODE_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PUBLICATION_STATUS_OPTIONS,
  WRITING_MODE_OPTIONS,
  type NovelBasicFormState,
} from "../novelBasicInfo.shared";
import {
  FieldLabel,
  SectionBlock,
  SelectionCard,
  findOptionSummary,
} from "./basicInfoForm/BasicInfoFormPrimitives";
import { ContinuationSourceSection } from "./basicInfoForm/ContinuationSourceSection";

interface WorldOption {
  id: string;
  name: string;
}

interface GenreOption {
  id: string;
  label: string;
  path: string;
}

interface NovelBasicInfoFormProps {
  basicForm: NovelBasicFormState;
  genreOptions: GenreOption[];
  worldOptions: WorldOption[];
  sourceNovelOptions: Array<{ id: string; title: string }>;
  sourceKnowledgeOptions: Array<{ id: string; title: string }>;
  sourceNovelBookAnalysisOptions: Array<{
    id: string;
    title: string;
    documentTitle: string;
    documentVersionNumber: number;
  }>;
  isLoadingSourceNovelBookAnalyses: boolean;
  availableBookAnalysisSections: Array<{ key: BookAnalysisSectionKey; title: string }>;
  onFormChange: (patch: Partial<NovelBasicFormState>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitLabel: string;
  showPublicationStatus?: boolean;
  titleQuickFill?: ReactNode;
}

export default function NovelBasicInfoForm(props: NovelBasicInfoFormProps) {
  const {
    basicForm,
    genreOptions,
    worldOptions,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses,
    availableBookAnalysisSections,
    onFormChange,
    onSubmit,
    isSubmitting,
    submitLabel,
    showPublicationStatus = true,
    titleQuickFill,
  } = props;

  const continuationSourceMissing = basicForm.writingMode === "continuation"
    && (
      (basicForm.continuationSourceType === "novel" && !basicForm.sourceNovelId)
      || (basicForm.continuationSourceType === "knowledge_document" && !basicForm.sourceKnowledgeDocumentId)
    );

  const continuationAnalysisSectionMissing = basicForm.writingMode === "continuation"
    && Boolean(basicForm.continuationBookAnalysisId)
    && basicForm.continuationBookAnalysisSections.length === 0;

  const hasSelectedContinuationSource = basicForm.continuationSourceType === "novel"
    ? Boolean(basicForm.sourceNovelId)
    : Boolean(basicForm.sourceKnowledgeDocumentId);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="text-sm font-semibold text-foreground">填写建议</div>
        <div className="mt-1 text-sm leading-6 text-muted-foreground">
          建议先完成标题、创作模式、项目模式、叙事视角，再补节奏、情绪和续写来源。这里的设置会直接影响后续主线规划、章节计划和正文生成。
        </div>
      </div>

      <SectionBlock
        title="作品定位"
        description="先定义这是什么作品，以及它是从零开始还是基于既有内容继续创作。"
      >
        <div className="space-y-2">
          <FieldLabel htmlFor="basic-title">小说标题</FieldLabel>
          <Input
            id="basic-title"
            value={basicForm.title}
            placeholder="例如：雾港审判局"
            onChange={(event) => onFormChange({ title: event.target.value })}
          />
          {titleQuickFill ? <div className="pt-1">{titleQuickFill}</div> : null}
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-description">一句话概述</FieldLabel>
          <textarea
            id="basic-description"
            rows={4}
            className="min-h-[112px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={basicForm.description}
            placeholder="用 2-4 句话说明主角、核心冲突和故事看点。"
            onChange={(event) => onFormChange({ description: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel hint={BASIC_INFO_FIELD_HINTS.writingMode}>创作模式</FieldLabel>
          <div className="grid gap-3 md:grid-cols-2">
            {WRITING_MODE_OPTIONS.map((option) => (
              <SelectionCard
                key={option.value}
                option={option}
                selected={basicForm.writingMode === option.value}
                onSelect={(value) => onFormChange({ writingMode: value })}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <FieldLabel htmlFor="basic-genre" hint={BASIC_INFO_FIELD_HINTS.genreId}>作品类型</FieldLabel>
            <select
              id="basic-genre"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.genreId}
              onChange={(event) => onFormChange({ genreId: event.target.value })}
            >
              <option value="">暂不设置类型</option>
              {genreOptions.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.path}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-world" hint={BASIC_INFO_FIELD_HINTS.worldId}>绑定世界观</FieldLabel>
            <select
              id="basic-world"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.worldId}
              onChange={(event) => onFormChange({ worldId: event.target.value })}
            >
              <option value="">不绑定世界观</option>
              {worldOptions.map((world) => (
                <option key={world.id} value={world.id}>
                  {world.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-default-length" hint={BASIC_INFO_FIELD_HINTS.defaultChapterLength}>
              默认章节字数
            </FieldLabel>
            <Input
              id="basic-default-length"
              type="number"
              min={500}
              max={10000}
              value={basicForm.defaultChapterLength}
              onChange={(event) => onFormChange({ defaultChapterLength: Number(event.target.value || 0) || 2800 })}
            />
            <div className="text-xs text-muted-foreground">推荐先设为 2500-3500，后续仍可按章节单独调整。</div>
          </div>
        </div>
      </SectionBlock>

      <SectionBlock
        title="叙事体验"
        description="这些字段定义读者会如何感知这部作品，也会直接影响章节规划的语气、密度和推进方式。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="basic-pov" hint={BASIC_INFO_FIELD_HINTS.narrativePov}>叙事视角</FieldLabel>
            <select
              id="basic-pov"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.narrativePov}
              onChange={(event) => onFormChange({ narrativePov: event.target.value as NovelBasicFormState["narrativePov"] })}
            >
              {POV_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">{findOptionSummary(POV_OPTIONS, basicForm.narrativePov)}</div>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-pace" hint={BASIC_INFO_FIELD_HINTS.pacePreference}>节奏偏好</FieldLabel>
            <select
              id="basic-pace"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.pacePreference}
              onChange={(event) => onFormChange({ pacePreference: event.target.value as NovelBasicFormState["pacePreference"] })}
            >
              {PACE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">{findOptionSummary(PACE_OPTIONS, basicForm.pacePreference)}</div>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-emotion" hint={BASIC_INFO_FIELD_HINTS.emotionIntensity}>情绪浓度</FieldLabel>
            <select
              id="basic-emotion"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.emotionIntensity}
              onChange={(event) => onFormChange({ emotionIntensity: event.target.value as NovelBasicFormState["emotionIntensity"] })}
            >
              {EMOTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">{findOptionSummary(EMOTION_OPTIONS, basicForm.emotionIntensity)}</div>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-style-tone" hint={BASIC_INFO_FIELD_HINTS.styleTone}>文风关键词</FieldLabel>
            <Input
              id="basic-style-tone"
              value={basicForm.styleTone}
              placeholder="例如：冷峻、克制、黑色幽默"
              onChange={(event) => onFormChange({ styleTone: event.target.value })}
            />
          </div>
        </div>
      </SectionBlock>

      <SectionBlock
        title="AI 协作方式"
        description="这部分定义你和 AI 如何分工，以及系统后续可以自动推进到什么程度。"
      >
        <div className="space-y-2">
          <FieldLabel hint={BASIC_INFO_FIELD_HINTS.projectMode}>项目模式</FieldLabel>
          <div className="grid gap-3 md:grid-cols-2">
            {PROJECT_MODE_OPTIONS.map((option) => (
              <SelectionCard
                key={option.value}
                option={option}
                selected={basicForm.projectMode === option.value}
                onSelect={(value) => onFormChange({ projectMode: value })}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="basic-ai-freedom" hint={BASIC_INFO_FIELD_HINTS.aiFreedom}>AI 自由度</FieldLabel>
            <select
              id="basic-ai-freedom"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.aiFreedom}
              onChange={(event) => onFormChange({ aiFreedom: event.target.value as NovelBasicFormState["aiFreedom"] })}
            >
              {AI_FREEDOM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">{findOptionSummary(AI_FREEDOM_OPTIONS, basicForm.aiFreedom)}</div>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-resource-score" hint={BASIC_INFO_FIELD_HINTS.resourceReadyScore}>
              资源完备度
            </FieldLabel>
            <Input
              id="basic-resource-score"
              type="number"
              min={0}
              max={100}
              value={basicForm.resourceReadyScore}
              onChange={(event) => onFormChange({
                resourceReadyScore: Math.max(0, Math.min(100, Number(event.target.value || 0))),
              })}
            />
            <div className="text-xs text-muted-foreground">0 表示刚起步，100 表示设定、角色和规划都比较完备。</div>
          </div>
        </div>
      </SectionBlock>

      {basicForm.writingMode === "continuation" ? (
        <ContinuationSourceSection
          basicForm={basicForm}
          sourceNovelOptions={sourceNovelOptions}
          sourceKnowledgeOptions={sourceKnowledgeOptions}
          sourceNovelBookAnalysisOptions={sourceNovelBookAnalysisOptions}
          isLoadingSourceNovelBookAnalyses={isLoadingSourceNovelBookAnalyses}
          availableBookAnalysisSections={availableBookAnalysisSections}
          hasSelectedContinuationSource={hasSelectedContinuationSource}
          onFormChange={onFormChange}
        />
      ) : null}

      <SectionBlock
        title="生产进度与状态"
        description="这些状态主要服务于项目管理和后续流程判断，不是一次性填死，后续可以按阶段调整。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="basic-project-status">项目状态</FieldLabel>
            <select
              id="basic-project-status"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.projectStatus}
              onChange={(event) => onFormChange({ projectStatus: event.target.value as NovelBasicFormState["projectStatus"] })}
            >
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-storyline-status">主线状态</FieldLabel>
            <select
              id="basic-storyline-status"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.storylineStatus}
              onChange={(event) => onFormChange({ storylineStatus: event.target.value as NovelBasicFormState["storylineStatus"] })}
            >
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-outline-status">大纲状态</FieldLabel>
            <select
              id="basic-outline-status"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.outlineStatus}
              onChange={(event) => onFormChange({ outlineStatus: event.target.value as NovelBasicFormState["outlineStatus"] })}
            >
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {showPublicationStatus ? (
            <div className="space-y-2">
              <FieldLabel hint={BASIC_INFO_FIELD_HINTS.status}>发布状态</FieldLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                {PUBLICATION_STATUS_OPTIONS.map((option) => (
                  <SelectionCard
                    key={option.value}
                    option={option}
                    selected={basicForm.status === option.value}
                    onSelect={(value) => onFormChange({ status: value })}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SectionBlock>

      {continuationSourceMissing ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          续写模式下需要先选择明确的上游来源，才能保存当前基本信息。
        </div>
      ) : null}

      {continuationAnalysisSectionMissing ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          你已经选择了拆书结果，但还没有选择要注入的拆书章节。
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || continuationSourceMissing || continuationAnalysisSectionMissing || !basicForm.title.trim()}
        >
          {isSubmitting ? "提交中..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
