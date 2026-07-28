import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Loader2, Settings2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { selectNovelProductionExperience } from "@/api/novelWorkflow";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

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
      ]);
      toast.success(response.experience === "simple"
        ? "简易创作已启动，AI 会继续完成整本书。"
        : "前期准备已完成，可以在专业工作台中继续创作。");
      navigate(response.targetRoute, { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "选择生产方式失败，请重试。"),
  });

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-3 py-5 sm:px-4 lg:px-0">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <BookOpen className="h-4 w-4" />
          自动导演已完成正文生产前的准备
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          选择《{novelTitle?.trim() || "这本小说"}》的生产方式
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          故事方向、角色和卷章安排准备完成。选择简易创作让 AI 自动完成整本书；选择专业创作则进入完整工作台亲自检查和调整。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="flex flex-col rounded-2xl border border-primary/30 bg-background p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">推荐新手</span>
          </div>
          <h2 className="mt-5 text-xl font-semibold text-foreground">简易创作</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
            AI 自动完成后续章节写作、审校、修复和必要的重规划。你只需在只读章节书架中查看进度和阅读完成稿。
          </p>
          <Button type="button" className="mt-6 w-full justify-between" disabled={mutation.isPending} onClick={() => mutation.mutate("simple")}>
            {mutation.isPending && mutation.variables === "simple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            让 AI 写完整本书
            <ArrowRight className="h-4 w-4" />
          </Button>
        </article>
        <article className="flex flex-col rounded-2xl border border-border bg-background p-6">
          <Settings2 className="h-6 w-6 text-muted-foreground" />
          <h2 className="mt-5 text-xl font-semibold text-foreground">专业创作</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
            打开完整工作台，查看和修改世界、角色、卷章规划与章节正文，并自行决定章节生产范围。
          </p>
          <Button type="button" variant="outline" className="mt-6 w-full justify-between" disabled={mutation.isPending} onClick={() => mutation.mutate("professional")}>
            {mutation.isPending && mutation.variables === "professional" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
            进入完整工作台
            <ArrowRight className="h-4 w-4" />
          </Button>
        </article>
      </div>
    </section>
  );
}
