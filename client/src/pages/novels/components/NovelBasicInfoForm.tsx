import i18next from "i18next";
import { useTranslation } from "react-i18next";
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
import BookPositioningStudio from "./basicInfoForm/BookPositioningStudio";
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
  const { t } = useTranslation();
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
        title={i18next.t("basicInfo.sectionOrientationTitle")}
        description={i18next.t("novels.novelBasicInfoForm.d13gju")}
        surface="none"
        className="space-y-5"
      >
        <BookPositioningStudio
          basicForm={basicForm}
          onFormChange={onFormChange}
          titleQuickFill={titleQuickFill}
          framingQuickFill={framingQuickFill}
          projectQuickStart={projectQuickStart}
          coverSection={coverSection}
        />

        <div className="space-y-2">
          <FieldLabel hint={BASIC_INFO_FIELD_HINTS.writingMode}>{i18next.t("basicInfo.writingMode")}</FieldLabel>
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
          <div className="font-medium text-foreground">{i18next.t("basicInfo.genreDiffTipTitle")}</div>
          <div>{i18next.t("basicInfo.genreDiffTipText")}</div>
        </div>

        {resourceRecommendation}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <FieldLabel htmlFor="basic-genre" hint={BASIC_INFO_FIELD_HINTS.genreId}>{i18next.t("basicInfo.genreId")}</FieldLabel>
            <SelectControl
              id="basic-genre"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.genreId}
              onChange={(event) => onFormChange({ genreId: event.target.value })}
            >
              <option value="">{i18next.t("basicInfo.genreIdPlaceholder")}</option>
              {genreOptions.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.path}
                </option>
              ))}
            </SelectControl>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-default-length" hint={BASIC_INFO_FIELD_HINTS.defaultChapterLength}>{i18next.t("basicInfo.defaultChapterLength")}</FieldLabel>
            <Input
              id="basic-default-length"
              type="number"
              min={500}
              max={10000}
              value={basicForm.defaultChapterLength}
              onChange={(event) => onFormChange({ defaultChapterLength: Number(event.target.value || 0) || 2800 })}
            />
            <div className="text-xs text-muted-foreground">{i18next.t("basicInfo.defaultChapterLengthHint")}</div>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-estimated-chapters" hint={BASIC_INFO_FIELD_HINTS.estimatedChapterCount}>{i18next.t("basicInfo.estimatedChapterCount")}</FieldLabel>
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
            <div className="text-xs text-muted-foreground">{i18next.t("basicInfo.estimatedChapterCountHint")}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="basic-primary-story-mode" hint={BASIC_INFO_FIELD_HINTS.primaryStoryModeId}>{i18next.t("basicInfo.primaryStoryMode")}</FieldLabel>
            <SelectControl
              id="basic-primary-story-mode"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.primaryStoryModeId}
              onChange={(event) => onFormChange({ primaryStoryModeId: event.target.value })}
            >
              <option value="">{i18next.t("basicInfo.primaryStoryModePlaceholder")}</option>
              {storyModeOptions.map((storyMode) => (
                <option key={storyMode.id} value={storyMode.id}>
                  {storyMode.path}
                </option>
              ))}
            </SelectControl>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="basic-secondary-story-mode" hint={BASIC_INFO_FIELD_HINTS.secondaryStoryModeId}>{i18next.t("basicInfo.secondaryStoryMode")}</FieldLabel>
            <SelectControl
              id="basic-secondary-story-mode"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={basicForm.secondaryStoryModeId}
              onChange={(event) => onFormChange({ secondaryStoryModeId: event.target.value })}
            >
              <option value="">{i18next.t("basicInfo.secondaryStoryModePlaceholder")}</option>
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
                <div className="text-sm font-semibold text-foreground">{i18next.t("basicInfo.primaryStoryModeSummary")}</div>
                <div className="mt-1 text-sm text-foreground">{primaryStoryMode.name}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {primaryStoryMode.description || primaryStoryMode.profile.coreDrive}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">核心驱动：{primaryStoryMode.profile.coreDrive}</div>
              </div>
            ) : null}
            {secondaryStoryMode ? (
              <div className="rounded-lg bg-muted/15 p-3">
                <div className="text-sm font-semibold text-foreground">{i18next.t("basicInfo.secondaryStoryModeSummary")}</div>
                <div className="mt-1 text-sm text-foreground">{secondaryStoryMode.name}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {secondaryStoryMode.description || secondaryStoryMode.profile.coreDrive}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">补充读者奖励：{secondaryStoryMode.profile.readerReward}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionBlock>

      <details className="group border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none">
          <CollapsibleSummary
            title={i18next.t("basicInfo.advancedSectionTitle")}
            description={i18next.t("basicInfo.advancedSectionDescription")}
          />
        </summary>

        <div className="mt-4 space-y-4">
          <div className="space-y-3 pt-1">
            <div className="text-sm font-semibold text-foreground">{i18next.t("basicInfo.worldSampleTitle")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{i18next.t("novels.novelBasicInfoForm.d82ql")}</div>
            <div className="space-y-2">
              <FieldLabel htmlFor="basic-world" hint={BASIC_INFO_FIELD_HINTS.worldId}>{i18next.t("basicInfo.worldSampleTitle")}</FieldLabel>
              <SelectControl
                id="basic-world"
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={basicForm.worldId}
                onChange={(event) => onFormChange({ worldId: event.target.value })}
              >
                <option value="">{i18next.t("basicInfo.worldSamplePlaceholder")}</option>
                {worldOptions.map((world) => (
                  <option key={world.id} value={world.id}>
                    {world.name}
                  </option>
                ))}
              </SelectControl>
            </div>
          </div>

          <SectionBlock
            title={i18next.t("basicInfo.narrativeExperienceTitle")}
            description={i18next.t("basicInfo.narrativeExperienceDescription")}
            surface="none"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="basic-pov" hint={BASIC_INFO_FIELD_HINTS.narrativePov}>{i18next.t("basicInfo.narrativePov")}</FieldLabel>
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
                <FieldLabel htmlFor="basic-pace" hint={BASIC_INFO_FIELD_HINTS.pacePreference}>{i18next.t("basicInfo.pacePreference")}</FieldLabel>
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
                <FieldLabel htmlFor="basic-emotion" hint={BASIC_INFO_FIELD_HINTS.emotionIntensity}>{i18next.t("basicInfo.emotionIntensity")}</FieldLabel>
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
                <FieldLabel htmlFor="basic-style-tone" hint={BASIC_INFO_FIELD_HINTS.styleTone}>{i18next.t("basicInfo.styleTone")}</FieldLabel>
                <Input
                  id="basic-style-tone"
                  value={basicForm.styleTone}
                  placeholder={i18next.t("basicInfo.styleTonePlaceholder")}
                  onChange={(event) => onFormChange({ styleTone: event.target.value })}
                />
              </div>
            </div>
          </SectionBlock>

          <SectionBlock
            title={i18next.t("basicInfo.aiCollaborationTitle")}
            description={i18next.t("basicInfo.aiCollaborationDescription")}
            surface="none"
          >
            <div className="space-y-2">
              <FieldLabel hint={BASIC_INFO_FIELD_HINTS.projectMode}>{i18next.t("basicInfo.projectMode")}</FieldLabel>
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
                <FieldLabel htmlFor="basic-resource-score" hint={BASIC_INFO_FIELD_HINTS.resourceReadyScore}>{i18next.t("basicInfo.resourceReadyScore")}</FieldLabel>
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

            <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <FieldLabel htmlFor="basic-post-generation-style-review" hint={BASIC_INFO_FIELD_HINTS.postGenerationStyleReviewEnabled}>{i18next.t("basicInfo.postGenerationStyleReview")}</FieldLabel>
                <div className="text-xs leading-5 text-muted-foreground">{i18next.t("basicInfo.postGenerationStyleReviewHint")}</div>
              </div>
              <Switch
                id="basic-post-generation-style-review"
                aria-label={i18next.t("basicInfo.postGenerationStyleReview")}
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
              title={i18next.t("basicInfo.continuationTitle")}
              description={i18next.t("basicInfo.continuationDescription")}
              collapsedLabel="展开设置"
              expandedLabel="收起设置"
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
            title={i18next.t("basicInfo.projectStatusTitle")}
            description={i18next.t("basicInfo.projectStatusDescription")}
            collapsedLabel="展开字段"
            expandedLabel="收起字段"
          />
        </summary>
        <div className="mt-4">
          <SectionBlock
            title={i18next.t("basicInfo.productionProgressTitle")}
            description={i18next.t("basicInfo.productionProgressDescription")}
            surface="none"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="basic-project-status">{i18next.t("basicInfo.projectStatus")}</FieldLabel>
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
                <FieldLabel htmlFor="basic-storyline-status">{i18next.t("basicInfo.storylineStatus")}</FieldLabel>
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
                <FieldLabel htmlFor="basic-outline-status">{i18next.t("basicInfo.outlineStatus")}</FieldLabel>
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
                  <FieldLabel hint={BASIC_INFO_FIELD_HINTS.status}>{i18next.t("basicInfo.status")}</FieldLabel>
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
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">{i18next.t("basicInfo.continuationSourceMissingError")}</div>
      ) : null}

      {continuationAnalysisSectionMissing ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">{i18next.t("basicInfo.continuationAnalysisSectionMissingError")}</div>
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
