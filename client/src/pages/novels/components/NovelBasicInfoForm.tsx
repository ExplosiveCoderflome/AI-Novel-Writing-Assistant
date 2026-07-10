import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { ReactNode } from "react";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AI_FREEDOM_OPTIONS,
  BASIC_INFO_FIELD_HINTS,
  DEFAULT_ESTIMATED_CHAPTER_COUNT,
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
import { BookFramingSection } from "./basicInfoForm/BookFramingSection";
import CollapsibleSummary from "./CollapsibleSummary";
import { ContinuationSourceSection } from "./basicInfoForm/ContinuationSourceSection";
import SelectControl from "@/components/common/SelectControl";

interface WorldOption {
  id: string;
  name: string;
}

interface GenreOption {
  id: string;
  label: string;
  path: string;
}

interface StoryModeOption {
  id: string;
  name: string;
  label: string;
  path: string;
  description?: string | null;
  profile: {
    coreDrive: string;
    readerReward: string;
  };
}

interface NovelBasicInfoFormProps {
  basicForm: NovelBasicFormState;
  genreOptions: GenreOption[];
  storyModeOptions: StoryModeOption[];
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
  framingQuickFill?: ReactNode;
  projectQuickStart?: ReactNode;
  resourceRecommendation?: ReactNode;
  coverSection?: ReactNode;
}

export default function NovelBasicInfoForm(props: NovelBasicInfoFormProps) {
  const {
    basicForm,
    genreOptions,
    storyModeOptions,
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
    framingQuickFill,
    projectQuickStart,
    resourceRecommendation,
    coverSection,
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
  const primaryStoryMode = storyModeOptions.find((item) => item.id === basicForm.primaryStoryModeId);
  const secondaryStoryMode = storyModeOptions.find((item) => item.id === basicForm.secondaryStoryModeId);

  return (
    <div className="space-y-4">
      <SectionBlock
        title={t("gen.pages.novels.components.NovelBasicInfoForm.workPlacement")}
        description={t("gen.pages.novels.components.NovelBasicInfoForm.gen_bd720a25")}
        surface="none"
        className="space-y-5"
      >
        {projectQuickStart ? <div className="flex justify-end">{projectQuickStart}</div> : null}

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-title">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_88af8bf5")}</FieldLabel>
          <Input
            id="basic-title"
            value={basicForm.title}
            placeholder={t("gen.pages.novels.components.NovelBasicInfoForm.gen_5f0c464b")}
            onChange={(event) => onFormChange({ title: event.target.value })}
          />
          {titleQuickFill ? <div className="pt-1">{titleQuickFill}</div> : null}
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="basic-description">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_d4ed84ef")}</FieldLabel>
          <textarea
            id="basic-description"
            rows={4}
            className="min-h-[112px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={basicForm.description}
            placeholder={t("gen.pages.novels.components.NovelBasicInfoForm.gen_db2128bf")}
            onChange={(event) => onFormChange({ description: event.target.value })}
          />
        </div>

        <BookFramingSection
          basicForm={basicForm}
          onFormChange={onFormChange}
          quickFill={framingQuickFill}
        />

        {coverSection}

        <div className="space-y-2">
          <FieldLabel hint={BASIC_INFO_FIELD_HINTS.writingMode}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_a7535508")}</FieldLabel>
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

        <div className="space-y-1 pt-1 text-sm leading-6 text-muted-foreground">
          <div className="font-medium text-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_ceddc4c2")}</div>
          <div>
            题材基底回答“这是什么书”，例如修仙、都市、历史架空；推进模式回答“这本书靠什么持续推进和兑现”，例如系统流、无敌流、种田流。
          </div>
        </div>

        {resourceRecommendation}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <FieldLabel htmlFor="basic-genre" hint={BASIC_INFO_FIELD_HINTS.genreId}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_daa08375")}</FieldLabel>
            <SelectControl
              id="basic-genre"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.genreId}
              onChange={(event) => onFormChange({ genreId: event.target.value })}
            >
              <option value="">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_c7ad22ca")}</option>
              {genreOptions.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.path}
                </option>
              ))}
            </SelectControl>
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
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_98effe73")}</div>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-estimated-chapters" hint={BASIC_INFO_FIELD_HINTS.estimatedChapterCount}>
              预计章节数
            </FieldLabel>
            <Input
              id="basic-estimated-chapters"
              type="number"
              min={1}
              max={2000}
              value={basicForm.estimatedChapterCount}
              onChange={(event) => onFormChange({
                estimatedChapterCount: Math.max(
                  1,
                  Math.min(2000, Number(event.target.value || 0) || DEFAULT_ESTIMATED_CHAPTER_COUNT),
                ),
              })}
            />
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_a9577ac2")}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="basic-primary-story-mode" hint={BASIC_INFO_FIELD_HINTS.primaryStoryModeId}>
              主推进模式
            </FieldLabel>
            <SelectControl
              id="basic-primary-story-mode"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.primaryStoryModeId}
              onChange={(event) => onFormChange({ primaryStoryModeId: event.target.value })}
            >
              <option value="">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_f90d00ec")}</option>
              {storyModeOptions.map((storyMode) => (
                <option key={storyMode.id} value={storyMode.id}>
                  {storyMode.path}
                </option>
              ))}
            </SelectControl>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-secondary-story-mode" hint={BASIC_INFO_FIELD_HINTS.secondaryStoryModeId}>
              副推进模式
            </FieldLabel>
            <SelectControl
              id="basic-secondary-story-mode"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.secondaryStoryModeId}
              onChange={(event) => onFormChange({ secondaryStoryModeId: event.target.value })}
            >
              <option value="">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_8084c201")}</option>
              {storyModeOptions.map((storyMode) => (
                <option
                  key={storyMode.id}
                  value={storyMode.id}
                  disabled={storyMode.id === basicForm.primaryStoryModeId}
                >
                  {storyMode.path}
                </option>
              ))}
            </SelectControl>
          </div>
        </div>

        {primaryStoryMode || secondaryStoryMode ? (
          <div className="grid gap-3 md:grid-cols-2">
            {primaryStoryMode ? (
              <div className="rounded-lg bg-muted/15 p-3">
                <div className="text-sm font-semibold text-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_9c14bd36")}</div>
                <div className="mt-1 text-sm text-foreground">{primaryStoryMode.name}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {primaryStoryMode.description || primaryStoryMode.profile.coreDrive}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_27ffb13b")}</div>
              </div>
            ) : null}
            {secondaryStoryMode ? (
              <div className="rounded-lg bg-muted/15 p-3">
                <div className="text-sm font-semibold text-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_3061ad0e")}</div>
                <div className="mt-1 text-sm text-foreground">{secondaryStoryMode.name}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {secondaryStoryMode.description || secondaryStoryMode.profile.coreDrive}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_7ec255ea")}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionBlock>

      <details className="group border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none">
          <CollapsibleSummary
            title={t("gen.pages.novels.components.NovelBasicInfoForm.gen_173d79b7")}
            description={t("gen.pages.novels.components.NovelBasicInfoForm.gen_d9a946ba")}
          />
        </summary>

        <div className="mt-4 space-y-4">
          <div className="space-y-3 pt-1">
            <div className="text-sm font-semibold text-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_1ebb0e05")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              这里只用于记录初始化参考。完整导入、生成和同步请在创建后到小说工作台的“本书世界”中完成。
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="basic-world" hint={BASIC_INFO_FIELD_HINTS.worldId}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_1ebb0e05")}</FieldLabel>
              <SelectControl
                id="basic-world"
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={basicForm.worldId}
                onChange={(event) => onFormChange({ worldId: event.target.value })}
              >
                <option value="">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_8514a792")}</option>
                {worldOptions.map((world) => (
                  <option key={world.id} value={world.id}>
                    {world.name}
                  </option>
                ))}
              </SelectControl>
            </div>
          </div>

          <SectionBlock
            title={t("gen.pages.novels.components.NovelBasicInfoForm.gen_c178e56a")}
            description={t("gen.pages.novels.components.NovelBasicInfoForm.gen_3e268a15")}
            surface="none"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="basic-pov" hint={BASIC_INFO_FIELD_HINTS.narrativePov}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_15dd65d3")}</FieldLabel>
                <SelectControl
                  id="basic-pov"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={basicForm.narrativePov}
                  onChange={(event) => onFormChange({ narrativePov: event.target.value as NovelBasicFormState["narrativePov"] })}
                >
                  {POV_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SelectControl>
                <div className="text-xs text-muted-foreground">{findOptionSummary(POV_OPTIONS, basicForm.narrativePov)}</div>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="basic-pace" hint={BASIC_INFO_FIELD_HINTS.pacePreference}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_d9dab569")}</FieldLabel>
                <SelectControl
                  id="basic-pace"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={basicForm.pacePreference}
                  onChange={(event) => onFormChange({ pacePreference: event.target.value as NovelBasicFormState["pacePreference"] })}
                >
                  {PACE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SelectControl>
                <div className="text-xs text-muted-foreground">{findOptionSummary(PACE_OPTIONS, basicForm.pacePreference)}</div>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="basic-emotion" hint={BASIC_INFO_FIELD_HINTS.emotionIntensity}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_7c4d3215")}</FieldLabel>
                <SelectControl
                  id="basic-emotion"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={basicForm.emotionIntensity}
                  onChange={(event) => onFormChange({ emotionIntensity: event.target.value as NovelBasicFormState["emotionIntensity"] })}
                >
                  {EMOTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SelectControl>
                <div className="text-xs text-muted-foreground">{findOptionSummary(EMOTION_OPTIONS, basicForm.emotionIntensity)}</div>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="basic-style-tone" hint={BASIC_INFO_FIELD_HINTS.styleTone}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_f9f30515")}</FieldLabel>
                <Input
                  id="basic-style-tone"
                  value={basicForm.styleTone}
                  placeholder={t("gen.pages.novels.components.NovelBasicInfoForm.gen_b5a3627b")}
                  onChange={(event) => onFormChange({ styleTone: event.target.value })}
                />
              </div>
            </div>
          </SectionBlock>

          <SectionBlock
            title={t("gen.pages.novels.components.NovelBasicInfoForm.gen_aba57d93")}
            description={t("gen.pages.novels.components.NovelBasicInfoForm.gen_bc4ff15b")}
            surface="none"
          >
            <div className="space-y-2">
              <FieldLabel hint={BASIC_INFO_FIELD_HINTS.projectMode}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_97da2dae")}</FieldLabel>
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
                <FieldLabel htmlFor="basic-ai-freedom" hint={BASIC_INFO_FIELD_HINTS.aiFreedom}>{t("gen.pages.novels.components.NovelBasicInfoForm.aiFreedomDegree")}</FieldLabel>
                <SelectControl
                  id="basic-ai-freedom"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={basicForm.aiFreedom}
                  onChange={(event) => onFormChange({ aiFreedom: event.target.value as NovelBasicFormState["aiFreedom"] })}
                >
                  {AI_FREEDOM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SelectControl>
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
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_b6983998")}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <FieldLabel htmlFor="basic-post-generation-style-review" hint={BASIC_INFO_FIELD_HINTS.postGenerationStyleReviewEnabled}>
                  正文后去 AI 检测与修正
                </FieldLabel>
                <div className="text-xs leading-5 text-muted-foreground">
                  开启后，章节正文生成完成时会检测 AI 味风险，并在命中可修正问题时生成修订稿。
                </div>
              </div>
              <Switch
                id="basic-post-generation-style-review"
                aria-label={t("gen.pages.novels.components.NovelBasicInfoForm.gen_9c8d9efd")}
                checked={basicForm.postGenerationStyleReviewEnabled}
                onCheckedChange={(checked) => onFormChange({ postGenerationStyleReviewEnabled: checked })}
              />
            </div>
          </SectionBlock>
        </div>
      </details>

      {basicForm.writingMode === "continuation" ? (
        <details className="group border-t border-border/60 pt-4" open>
          <summary className="cursor-pointer list-none">
            <CollapsibleSummary
              title={t("gen.pages.novels.components.NovelBasicInfoForm.gen_ea40412e")}
              description={t("gen.pages.novels.components.NovelBasicInfoForm.gen_1c50875d")}
              collapsedLabel={t("gen.pages.novels.components.NovelBasicInfoForm.gen_4847d889")}
              expandedLabel={t("gen.pages.novels.components.NovelBasicInfoForm.gen_4f5318f5")}
            />
          </summary>
          <div className="mt-4">
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
          </div>
        </details>
      ) : null}

      <details className="group border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none">
          <CollapsibleSummary
            title={t("gen.pages.novels.components.NovelBasicInfoForm.gen_ded02e99")}
            description={t("gen.pages.novels.components.NovelBasicInfoForm.gen_57ba9dfa")}
            collapsedLabel={t("gen.pages.novels.components.NovelBasicInfoForm.gen_e63bb203")}
            expandedLabel={t("gen.pages.novels.components.NovelBasicInfoForm.gen_4c959ed3")}
          />
        </summary>
        <div className="mt-4">
          <SectionBlock
            title={t("gen.pages.novels.components.NovelBasicInfoForm.gen_24f47a19")}
            description={t("gen.pages.novels.components.NovelBasicInfoForm.gen_a593d7f1")}
            surface="none"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="basic-project-status">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_3b94c707")}</FieldLabel>
                <SelectControl
                  id="basic-project-status"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={basicForm.projectStatus}
                  onChange={(event) => onFormChange({ projectStatus: event.target.value as NovelBasicFormState["projectStatus"] })}
                >
                  {PROJECT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SelectControl>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="basic-storyline-status">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_39e440e6")}</FieldLabel>
                <SelectControl
                  id="basic-storyline-status"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={basicForm.storylineStatus}
                  onChange={(event) => onFormChange({ storylineStatus: event.target.value as NovelBasicFormState["storylineStatus"] })}
                >
                  {PROJECT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SelectControl>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="basic-outline-status">{t("gen.pages.novels.components.NovelBasicInfoForm.gen_b2430dc7")}</FieldLabel>
                <SelectControl
                  id="basic-outline-status"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={basicForm.outlineStatus}
                  onChange={(event) => onFormChange({ outlineStatus: event.target.value as NovelBasicFormState["outlineStatus"] })}
                >
                  {PROJECT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </SelectControl>
              </div>

              {showPublicationStatus ? (
                <div className="space-y-2">
                  <FieldLabel hint={BASIC_INFO_FIELD_HINTS.status}>{t("gen.pages.novels.components.NovelBasicInfoForm.gen_401cbdbf")}</FieldLabel>
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
        </div>
      </details>

      {continuationSourceMissing ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          续写模式下需要先选择明确的上游来源，才能保存基本信息。
        </div>
      ) : null}

      {continuationAnalysisSectionMissing ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          拆书结果需要搭配要注入的拆书章节。
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || continuationSourceMissing || continuationAnalysisSectionMissing || !basicForm.title.trim()}
        >
          {isSubmitting ? t("gen.pages.novels.components.NovelBasicInfoForm.gen_abe2c5d2") : submitLabel}
        </Button>
      </div>
    </div>
  );
}
