import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  getModelRoutes,
  saveAPIKeySetting,
  saveModelRoute,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";

export type DirectorBudgetRecoveryAction = "disable_thinking" | "raise_budget";

// The one-click recovery raises the planner budget to the same ceiling the
// automatic budget retry uses, so the manual step always goes further than
// the retry the system already attempted on its own.
const PLANNER_BUDGET_RECOVERY_TARGET = 32_768;
const DEFAULT_PLANNER_OUTPUT_TOKENS = 8_192;

// Mirrors the server planner default (DEFAULT_ROUTES.planner in
// server/src/llm/modelRouter.ts). Only used when no planner route row exists,
// so creating the row keeps every other planner call resolving to the same
// provider and model it already uses today.
const PLANNER_ROUTE_DEFAULTS = {
  provider: "deepseek",
  model: "deepseek-flash",
  temperature: 0.3,
  requestProtocol: "auto",
  structuredResponseFormat: "auto",
} as const;

interface DirectorBudgetRecoveryOptions {
  enabled: boolean;
  provider: LLMProvider | null;
  onRetry?: () => void;
}

export function useDirectorBudgetRecovery(options: DirectorBudgetRecoveryOptions) {
  const queryClient = useQueryClient();
  const modelRoutesQuery = useQuery({
    queryKey: queryKeys.settings.modelRoutes,
    queryFn: async () => (await getModelRoutes()).data,
    enabled: options.enabled,
    retry: false,
  });
  const plannerRoute = modelRoutesQuery.data?.routes.find((route) => route.taskType === "planner");
  const currentPlannerMaxTokens = plannerRoute?.maxTokens ?? DEFAULT_PLANNER_OUTPUT_TOKENS;
  const canRaiseBudget = currentPlannerMaxTokens < PLANNER_BUDGET_RECOVERY_TARGET;

  const mutation = useMutation({
    mutationFn: async (action: DirectorBudgetRecoveryAction) => {
      if (action === "disable_thinking") {
        if (!options.provider) {
          throw new Error("当前任务没有记录使用的厂商。");
        }
        await saveAPIKeySetting(options.provider, { reasoningEnabled: false });
        await queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys });
        return { action, saved: true };
      }
      const routes = (await getModelRoutes()).data?.routes ?? [];
      const route = routes.find((item) => item.taskType === "planner");
      const currentMaxTokens = route?.maxTokens ?? DEFAULT_PLANNER_OUTPUT_TOKENS;
      if (currentMaxTokens >= PLANNER_BUDGET_RECOVERY_TARGET) {
        return { action, saved: false };
      }
      await saveModelRoute({
        taskType: "planner",
        provider: route?.provider ?? PLANNER_ROUTE_DEFAULTS.provider,
        model: route?.model ?? PLANNER_ROUTE_DEFAULTS.model,
        temperature: route?.temperature ?? PLANNER_ROUTE_DEFAULTS.temperature,
        maxTokens: PLANNER_BUDGET_RECOVERY_TARGET,
        requestProtocol: route?.requestProtocol ?? PLANNER_ROUTE_DEFAULTS.requestProtocol,
        structuredResponseFormat: route?.structuredResponseFormat ?? PLANNER_ROUTE_DEFAULTS.structuredResponseFormat,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes });
      return { action, saved: true };
    },
    onSuccess: ({ action, saved }) => {
      if (action === "disable_thinking") {
        toast.success("关闭深度思考后重新生成。");
      } else if (saved) {
        toast.success("提高输出上限后重新生成。");
      } else {
        toast.success("输出上限没有可提高的空间，直接重新生成。");
      }
      options.onRetry?.();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "恢复失败，请重试。";
      toast.error(message);
    },
  });

  return {
    recover: (action: DirectorBudgetRecoveryAction) => {
      mutation.mutate(action);
    },
    isPending: mutation.isPending,
    pendingAction: mutation.variables ?? null,
    canRaiseBudget,
  };
}
