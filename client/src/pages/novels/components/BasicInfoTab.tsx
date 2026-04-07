import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { BasicTabProps } from "./NovelEditView.types";
import NovelBasicInfoForm from "./NovelBasicInfoForm";
import NovelStyleRecommendationCard from "./NovelStyleRecommendationCard";
import NovelWorldUsageCard from "./NovelWorldUsageCard";
import { BookFramingQuickFillButton } from "./basicInfoForm/BookFramingQuickFillButton";
import CollapsibleSummary from "./CollapsibleSummary";
import NovelCreateTitleQuickFill from "./titleWorkshop/NovelCreateTitleQuickFill";
import NovelTitleWorkshop from "./titleWorkshop/NovelTitleWorkshop";

export default function BasicInfoTab(props: BasicTabProps) {
  return (
    <div className="space-y-4">
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
            title="标题、写法与世界补充工具"
            description="这些属于次级辅助工具。先把书级定位填清楚，再按需展开使用。"
            meta="标题工坊 / 写法建议 / 世界使用"
          />
        </summary>

        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>标题工坊</CardTitle>
                <div className="text-sm leading-6 text-muted-foreground">
                  在项目内快速生成标题候选；如果要做跨项目沉淀和筛选，可以进入完整标题工坊。
                </div>
              </div>
              <Button asChild type="button" variant="outline">
                <Link to="/titles">打开完整工坊</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <NovelTitleWorkshop
                novelId={props.novelId}
                currentTitle={props.basicForm.title}
                currentDescription={props.basicForm.description}
                genreId={props.basicForm.genreId}
                onApplyTitle={(title) => props.onFormChange({ title })}
              />
            </CardContent>
          </Card>

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
