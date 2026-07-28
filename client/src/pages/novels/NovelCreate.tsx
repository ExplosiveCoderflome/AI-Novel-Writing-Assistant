import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { bootstrapNovelWorkflow } from "@/api/novelWorkflow";
import { createNovel } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/storyMode";
import { getWorldList } from "@/api/world";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, SlidersHorizontal } from "lucide-react";
import NovelBasicInfoForm from "./components/NovelBasicInfoForm";
import NovelCreateResourceRecommendationCard from "./components/NovelCreateResourceRecommendationCard";
import { BookFramingQuickFillButton } from "./components/basicInfoForm/BookFramingQuickFillButton";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [basicForm, setBasicForm] = useState(() => createDefaultNovelBasicFormState());

  const workflowTaskIdFromQuery = searchParams.get("workflowTaskId") ?? "";
  const workflowMode = searchParams.get("mode");
  const creationChoice = searchParams.get("experience");

  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });
  const genreOptions = flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []);
  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });
  const storyModeOptions = flattenStoryModeTreeOptions(storyModeTreeQuery.data?.data ?? []);

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

  useEffect(() => {
    if (workflowMode !== "director") {
      return;
    }
    const params = new URLSearchParams();
    if (workflowTaskIdFromQuery) {
      params.set("taskId", workflowTaskIdFromQuery);
    }
    navigate(`/novels/auto-director${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
  }, [navigate, workflowMode, workflowTaskIdFromQuery]);

  const restoreWorkflowMutation = useMutation({
    mutationFn: () => bootstrapNovelWorkflow({
      workflowTaskId: workflowTaskIdFromQuery || undefined,
      lane: "manual_create",
    }),
    onSuccess: (response) => {
      const task = response.data;
      if (!task) {
        return;
      }
      const seedPayload = (task.meta.seedPayload ?? null) as { basicForm?: Partial<typeof basicForm> } | null;
      if (seedPayload?.basicForm) {
        setBasicForm((prev) => patchNovelBasicForm(prev, seedPayload.basicForm ?? {}));
      }
      if (task.id !== workflowTaskIdFromQuery) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("workflowTaskId", task.id);
          return next;
        }, { replace: true });
      }
    },
  });

  useEffect(() => {
    if (!workflowTaskIdFromQuery || workflowMode === "director") {
      return;
    }
    restoreWorkflowMutation.mutate();
  }, [workflowTaskIdFromQuery, workflowMode]);

  const createNovelMutation = useMutation({
    mutationFn: async () => {
      const task = await bootstrapNovelWorkflow({
        lane: "manual_create",
        title: basicForm.title,
        seedPayload: {
          basicForm,
        },
      });
      const created = await createNovel(buildNovelCreatePayload(basicForm));
      const novelId = created.data?.id;
      if (!novelId) {
        return {
          response: created,
          workflowTaskId: task.data?.id ?? "",
        };
      }
      const attached = await bootstrapNovelWorkflow({
        workflowTaskId: task.data?.id,
        novelId,
        lane: "manual_create",
        title: created.data?.title,
        seedPayload: {
          basicForm,
        },
      });
      return {
        response: created,
        workflowTaskId: attached.data?.id ?? task.data?.id ?? "",
      };
    },
    onSuccess: async ({ response, workflowTaskId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      if (response.data?.id) {
        const search = new URLSearchParams();
        search.set("stage", "basic");
        if (workflowTaskId) {
          search.set("workspaceTaskId", workflowTaskId);
        }
        navigate(`/novels/${response.data.id}/edit?${search.toString()}`);
      }
    },
  });

  if (!creationChoice && !workflowTaskIdFromQuery && workflowMode !== "director") {
    return (
      <div className="mx-auto max-w-5xl space-y-8 px-3 py-8 sm:px-4 lg:px-0">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">你想怎样完成这本小说？</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            第一次写小说，建议让 AI 负责规划和写作。你只需要给一句灵感，再从两个方向中选一个。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            to="/novels/simple-create"
            className="group rounded-2xl border border-primary/30 bg-primary/5 p-6 transition hover:border-primary/60 hover:bg-primary/10"
          >
            <div className="flex items-center justify-between gap-4">
              <Sparkles className="h-6 w-6 text-primary" />
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">推荐</span>
            </div>
            <div className="mt-5 text-xl font-semibold text-foreground">简易创作</div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              写一句灵感并选择题材，AI 给出两个整书方向。选定后自动完成规划、章节写作、审校与修复。
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm font-medium text-primary">
              开始简易创作 <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </div>
          </Link>
          <button
            type="button"
            className="group rounded-2xl border border-border bg-background p-6 text-left transition hover:border-foreground/30 hover:bg-muted/20"
            onClick={() => setSearchParams({ experience: "professional" })}
          >
            <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
            <div className="mt-5 text-xl font-semibold text-foreground">专业创作</div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground">
              自己设置题材、世界、角色、写法与执行范围，并在完整工作台中随时编辑和调整。
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm font-medium text-foreground">
              打开完整设置 <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-3 py-4 sm:px-4 lg:px-0">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">专业创作</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            推荐先让 AI 自动导演从一句灵感整理方向、世界、角色和章节准备。需要完全手动填写时，也可以继续使用下方表单。
          </p>
        </div>
        <Button type="button" asChild className="shrink-0">
          <Link to="/novels/auto-director">AI 自动导演开书</Link>
        </Button>
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-lg font-semibold leading-7 text-foreground">手动创建</div>
          <div className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            手动路径适合你已经清楚题材、卖点和前期承诺的项目；创建后仍可在工作台继续调整。
          </div>
        </div>
        <NovelBasicInfoForm
          basicForm={basicForm}
          genreOptions={genreOptions}
          storyModeOptions={storyModeOptions}
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
          framingQuickFill={(
            <BookFramingQuickFillButton
              basicForm={basicForm}
              genreOptions={genreOptions}
              onApplySuggestion={(patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch))}
            />
          )}
          resourceRecommendation={(
            <NovelCreateResourceRecommendationCard
              basicForm={basicForm}
              onApplySuggestion={(patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch))}
            />
          )}
          titleQuickFill={(
            <NovelCreateTitleQuickFill
              basicForm={basicForm}
              onApplyTitle={(title) => setBasicForm((prev) => patchNovelBasicForm(prev, { title }))}
            />
          )}
        />
      </section>
    </div>
  );
}
