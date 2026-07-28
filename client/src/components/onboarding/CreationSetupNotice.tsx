import { useQuery } from "@tanstack/react-query";
import { ArrowRight, KeyRound } from "lucide-react";
import { getQuickSetupStatus } from "@/api/onboarding";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { useCreationSetup } from "./CreationSetupContext";

export default function CreationSetupNotice() {
  const { openQuickSetup } = useCreationSetup();
  const statusQuery = useQuery({
    queryKey: queryKeys.settings.quickSetup,
    queryFn: getQuickSetupStatus,
    staleTime: 60_000,
  });
  const status = statusQuery.data?.data;
  if (statusQuery.isPending || statusQuery.isError || status?.readyForCreation) {
    return null;
  }
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-amber-300 bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-amber-950">完成快捷配置后就可以启动 AI 创作</div>
          <p className="mt-1 text-sm leading-6 text-amber-900/80">
            {status?.blockingReasons[0] ?? "选择一个文本模型，系统会自动准备规划、正文、审校和修复所需的任务路由。"}
          </p>
        </div>
      </div>
      <Button className="shrink-0" onClick={openQuickSetup}>
        快捷配置 <ArrowRight className="h-4 w-4" />
      </Button>
    </section>
  );
}
