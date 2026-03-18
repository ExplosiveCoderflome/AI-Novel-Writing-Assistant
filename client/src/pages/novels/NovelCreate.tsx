import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { createNovel } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { getWorldList } from "@/api/world";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import NovelBasicInfoForm from "./components/NovelBasicInfoForm";
import NovelCreateTitleQuickFill from "./components/titleWorkshop/NovelCreateTitleQuickFill";
import { useNovelContinuationSources } from "./hooks/useNovelContinuationSources";
import {
  buildNovelCreatePayload,
  createDefaultNovelBasicFormState,
  patchNovelBasicForm,
} from "./novelBasicInfo.shared";

export default function NovelCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [basicForm, setBasicForm] = useState(() => createDefaultNovelBasicFormState());

  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });

  const {
    sourceBookAnalysesQuery,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
  } = useNovelContinuationSources("", basicForm);

  useEffect(() => {
    if (
      basicForm.writingMode !== "continuation"
      || !basicForm.continuationBookAnalysisId
    ) {
      return;
    }
    if (sourceBookAnalysesQuery.isLoading || sourceBookAnalysesQuery.isFetching) {
      return;
    }
    const exists = sourceNovelBookAnalysisOptions.some((item) => item.id === basicForm.continuationBookAnalysisId);
    if (exists) {
      return;
    }
    setBasicForm((prev) => ({
      ...prev,
      continuationBookAnalysisId: "",
      continuationBookAnalysisSections: [],
    }));
  }, [
    basicForm.continuationBookAnalysisId,
    basicForm.writingMode,
    sourceBookAnalysesQuery.isFetching,
    sourceBookAnalysesQuery.isLoading,
    sourceNovelBookAnalysisOptions,
  ]);

  const createNovelMutation = useMutation({
    mutationFn: () => createNovel(buildNovelCreatePayload(basicForm)),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      if (response.data?.id) {
        navigate(`/novels/${response.data.id}/edit`);
      }
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>创建小说项目</CardTitle>
          <CardDescription>
            先把项目的基本信息定义清楚。这里的设置会直接影响后续主线规划、章节计划和 AI 生成行为，创建后仍可继续调整。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NovelBasicInfoForm
            basicForm={basicForm}
            genreOptions={flattenGenreTreeOptions(genreTreeQuery.data?.data ?? [])}
            worldOptions={worldListQuery.data?.data ?? []}
            sourceNovelOptions={sourceNovelOptions}
            sourceKnowledgeOptions={sourceKnowledgeOptions}
            sourceNovelBookAnalysisOptions={sourceNovelBookAnalysisOptions}
            isLoadingSourceNovelBookAnalyses={sourceBookAnalysesQuery.isLoading}
            availableBookAnalysisSections={[...BOOK_ANALYSIS_SECTIONS]}
            onFormChange={(patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch))}
            onSubmit={() => createNovelMutation.mutate()}
            isSubmitting={createNovelMutation.isPending}
            submitLabel="创建并进入项目"
            showPublicationStatus={false}
            titleQuickFill={(
              <NovelCreateTitleQuickFill
                basicForm={basicForm}
                onApplyTitle={(title) => setBasicForm((prev) => patchNovelBasicForm(prev, { title }))}
              />
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
