import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getModelRouteConnectivityStatus, testModelRouteConnectivity } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";

/**
 * 模型路由连通性检查统一 Hook。
 *
 * - 所有设置页面共用同一状态源（后端 single-flight 状态机 + 指纹缓存）
 * - 进入页面只查 GET /status（轻量），绝不自动触发探针
 * - running 时自动轮询（2s），done/idle 停止
 * - triggerCheck(force)：手动刷新；checkAfterConfigChange()：保存路由后自动检查
 */
export function useModelRouteCheck() {
  const queryClient = useQueryClient();
  const checkKey = queryKeys.settings.modelRouteConnectivity;

  const statusQuery = useQuery({
    queryKey: checkKey,
    queryFn: getModelRouteConnectivityStatus,
    refetchInterval: (query) => (query.state.data?.data?.status === "running" ? 2000 : false),
    refetchOnWindowFocus: false,
  });

  const triggerCheck = useMutation({
    mutationFn: (force: boolean) => testModelRouteConnectivity(force),
    onSuccess: (resp) => {
      // 统一状态写入，跨页面共享
      queryClient.setQueryData(checkKey, resp);
      if (resp.data?.status === "running") {
        void statusQuery.refetch();
      }
    },
  });

  return {
    /** 当前检查状态（idle/running/done + result），来自 GET /status */
    status: statusQuery.data?.data,
    /** 是否正在检查（POST 进行中 或 后端 running） */
    isChecking: triggerCheck.isPending || statusQuery.data?.data?.status === "running",
    /** 触发检查：true 强制绕过指纹缓存（仍受 single-flight 约束） */
    triggerCheck,
    /** 配置变更后自动触发新检查（指纹变化 → 后端启动新任务） */
    checkAfterConfigChange: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes });
      triggerCheck.mutate(false);
    },
  };
}
