import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, Loader2, Settings2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { selectNovelProductionExperience } from "@/api/novelWorkflow";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import OnboardingTip from "@/components/onboarding/OnboardingTip";
import { queryKeys } from "@/api/queryKeys";

interface NovelProductionExperienceHandoffProps {
  taskId: string;
  novelId: string;
  novelTitle?: string;
}

export default function NovelProductionExperienceHandoff({
  taskId,
  novelId,
  novelTitle,
}: NovelProductionExperienceHandoffProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (experience: "simple" | "professional") => {
      const response = await selectNovelProductionExperience(taskId, experience);
      if (!response.data) {
        throw new Error("生产方式选择没有返回跳转位置。");
      }
      return response.data;
    },
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["novels", novelId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.firstNovel }),
      ]);
      toast.success(response.experience === "simple"
        ? "已切换到阅读书架，AI 会继续完成整本书。"
        : "已切换到完整工作台，AI 会继续完成整本书。");
      navigate(response.targetRoute, { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "选择生产方式失败，请重试。"),
  });

  return (
    <section className="mx-auto max-w-5xl space-y-5 px-3 py-6 sm:px-4 lg:px-0">
      <OnboardingTip
        storageKey="production-experience-handoff"
        title="选择你想使用的创作界面"
        description="两种界面共享同一套创作、审校和恢复能力；阅读书架更专注于正文，完整工作台会展示更多创作资料。"
      />
      <div className="relative overflow-hidden rounded-3xl bg-foreground px-6 py-7 text-background shadow-[0_30px_80px_-50px_hsl(var(--foreground))] sm:px-8 sm:py-9">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-medium text-background/70">
            <BookOpen className="h-4 w-4" />
            开写前准备完成
          </div>
          <h1 className="mt-4 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
            选择《{novelTitle?.trim() || "这本小说"}》的创作界面
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-background/70">
            故事方向、角色和卷章安排准备完毕。选择界面后，AI 会持续推进整本书；你可以随时切换界面，创作进度和操作权限保持一致。
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="flex flex-col rounded-3xl border border-primary/30 bg-background p-6 shadow-[0_24px_65px_-50px_hsl(var(--primary))] ring-1 ring-primary/10 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">推荐新手</span>
          </div>
          <h2 className="mt-5 text-xl font-semibold text-foreground">阅读书架</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">优先展示章节进度、已保存正文和需要关注的事项。</p>
          <ul className="mt-5 flex-1 space-y-3 text-sm text-foreground">
            {["持续写完整本书", "自动审校、修复与必要重规划", "专注阅读已保存正文"].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Check className="h-4 w-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
          <Button type="button" className="mt-6 w-full justify-between" disabled={mutation.isPending} onClick={() => mutation.mutate("simple")}>
            {mutation.isPending && mutation.variables === "simple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            使用阅读书架
            <ArrowRight className="h-4 w-4" />
          </Button>
        </article>
        <article className="flex flex-col rounded-3xl border border-border/80 bg-background p-6 sm:p-7">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Settings2 className="h-5 w-5" />
          </span>
          <h2 className="mt-5 text-xl font-semibold text-foreground">完整工作台</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">展示规划、角色、章节和任务等完整创作资料。</p>
          <ul className="mt-5 flex-1 space-y-3 text-sm text-foreground">
            {["持续写完整本书", "查看并调整全部创作资产", "自由修改卷章规划与正文"].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                {item}
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" className="mt-6 w-full justify-between" disabled={mutation.isPending} onClick={() => mutation.mutate("professional")}>
            {mutation.isPending && mutation.variables === "professional" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
            使用完整工作台
            <ArrowRight className="h-4 w-4" />
          </Button>
        </article>
      </div>
    </section>
  );
}
