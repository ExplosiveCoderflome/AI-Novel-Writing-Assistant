import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BasicTabProps } from "./NovelEditView.types";
import NovelBasicInfoForm from "./NovelBasicInfoForm";
import NovelStyleRecommendationCard from "./NovelStyleRecommendationCard";
import NovelWorldUsageCard from "./NovelWorldUsageCard";
import { BookFramingQuickFillButton } from "./basicInfoForm/BookFramingQuickFillButton";
import CollapsibleSummary from "./CollapsibleSummary";
import NovelCreateTitleQuickFill from "./titleWorkshop/NovelCreateTitleQuickFill";
import NovelTitleWorkshop from "./titleWorkshop/NovelTitleWorkshop";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";

export default function BasicInfoTab(props: BasicTabProps) {
  return (
    <div className="space-y-4">
      <DirectorTakeoverEntryPanel
        title="让 AI 从当前项目继续接管"
        description="如果你已经填过基础信息，可以直接从当前步骤开始自动接管，并选择继续已有进度或重跑当前步。"
        entry={props.directorTakeoverEntry}
      />
      <Card>
        <CardHeader>
          <CardTitle>书级定位与基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <NovelBasicInfoForm
            basicForm={props.basicForm}
            genreOptions={props.genreOptions}
            storyModeOptions={props.storyModeOptions}
            worldOptions={props.worldOptions}
            sourceNovelOptions={props.sourceNovelOptions}
            sourceKnowledgeOptions={props.sourceKnowledgeOptions}
            sourceNovelBookAnalysisOptions={props.sourceNovelBookAnalysisOptions}
            isLoadingSourceNovelBookAnalyses={props.isLoadingSourceNovelBookAnalyses}
            availableBookAnalysisSections={props.availableBookAnalysisSections}
            onFormChange={props.onFormChange}
            onSubmit={props.onSave}
            isSubmitting={props.isSaving}
            submitLabel="保存基本信息"
            titleQuickFill={(
              <NovelCreateTitleQuickFill
                basicForm={props.basicForm}
                onApplyTitle={(title) => props.onFormChange({ title })}
              />
            )}
            framingQuickFill={(
              <BookFramingQuickFillButton
                basicForm={props.basicForm}
                genreOptions={props.genreOptions}
                onApplySuggestion={props.onFormChange}
              />
            )}
            projectQuickStart={props.projectQuickStart}
          />
        </CardContent>
      </Card>

      <details className="group rounded-2xl border border-border/70 bg-background/95 p-4">
        <summary className="cursor-pointer list-none">
          <CollapsibleSummary
            title="写法与世界补强"
            description="标题快速选填已经放在上方标题字段旁。这里保留开写前的写法确认和本书世界边界整理。"
            meta="写法建议 / 世界使用"
          />
        </summary>

        <div className="mt-4 space-y-4">
          <NovelStyleRecommendationCard novelId={props.novelId} />

          <NovelWorldUsageCard
            view={props.worldSliceView}
            message={props.worldSliceMessage}
            isRefreshing={props.isRefreshingWorldSlice}
            isSaving={props.isSavingWorldSliceOverrides}
            onRefresh={props.onRefreshWorldSlice}
            onSave={props.onSaveWorldSliceOverrides}
          />
        </div>
      </details>
    </div>
  );
}
