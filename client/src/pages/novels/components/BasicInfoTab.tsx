import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BasicTabProps } from "./NovelEditView.types";
import NovelBasicInfoForm from "./NovelBasicInfoForm";

export default function BasicInfoTab(props: BasicTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
      </CardHeader>
      <CardContent>
        <NovelBasicInfoForm
          basicForm={props.basicForm}
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
        />
      </CardContent>
    </Card>
  );
}
