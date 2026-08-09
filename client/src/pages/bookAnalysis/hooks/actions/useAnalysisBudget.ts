import i18next from "i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BookAnalysisDetail } from "@ai-novel/shared/types/bookAnalysis";
import {
  resumeBookAnalysisWithBudget,
  updateBookAnalysisBudget,
} from "@/api/bookAnalysis";
import { toast } from "@/components/ui/toast";

export function useAnalysisBudget(input: {
  selectedAnalysisId: string;
  refreshAnalysisData: (analysisId: string) => Promise<void>;
  onAnalysisUpdated: (analysis: BookAnalysisDetail) => void;
}) {
  const { selectedAnalysisId, refreshAnalysisData, onAnalysisUpdated } = input;
  const queryClient = useQueryClient();

  const updateBudgetMutation = useMutation({
    mutationFn: (payload: { id: string; budgetTokens: number | null }) =>
      updateBookAnalysisBudget(payload.id, { budgetTokens: payload.budgetTokens }),
    onSuccess: async (response, payload) => {
      if (!response.data) {
        return;
      }
      onAnalysisUpdated(response.data);
      toast.success(i18next.t("gen.pages.bookAnalysis.hooks.actions.useAnalysisBudget.gen_858e0779"));
      await queryClient.invalidateQueries({ queryKey: ["book-analysis"] });
      await refreshAnalysisData(payload.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : i18next.t("gen.pages.bookAnalysis.hooks.actions.useAnalysisBudget.gen_8ee0a0a4"));
    },
  });

  const resumeWithBudgetMutation = useMutation({
    mutationFn: (payload: { id: string; budgetTokens: number }) =>
      resumeBookAnalysisWithBudget(payload.id, { budgetTokens: payload.budgetTokens }),
    onSuccess: async (response, payload) => {
      if (!response.data) {
        return;
      }
      onAnalysisUpdated(response.data);
      toast.success(i18next.t("gen.pages.bookAnalysis.hooks.actions.useAnalysisBudget.gen_b0ca6863"));
      await queryClient.invalidateQueries({ queryKey: ["book-analysis"] });
      await refreshAnalysisData(payload.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : i18next.t("gen.pages.bookAnalysis.hooks.actions.useAnalysisBudget.gen_8538bbd0"));
    },
  });

  const updateBudget = async (budgetTokens: number | null) => {
    if (!selectedAnalysisId) {
      return;
    }
    await updateBudgetMutation.mutateAsync({
      id: selectedAnalysisId,
      budgetTokens,
    });
  };

  const resumeWithBudget = async (budgetTokens: number) => {
    if (!selectedAnalysisId) {
      return;
    }
    await resumeWithBudgetMutation.mutateAsync({
      id: selectedAnalysisId,
      budgetTokens,
    });
  };

  return {
    updateBudget,
    resumeWithBudget,
    pending: {
      updateBudget: updateBudgetMutation.isPending,
      resumeWithBudget: resumeWithBudgetMutation.isPending,
    },
  };
}
