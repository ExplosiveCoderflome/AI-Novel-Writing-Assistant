import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import type { DirectorManualEditImpact, DirectorManualEditImpactLevel } from "@ai-novel/shared/types/directorRuntime";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { getDirectorManualEditImpact } from "@/api/novelDirector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

interface TaskCenterManualEditImpactCardProps {
  task: UnifiedTaskDetail;
}

function formatImpactLevel(level: DirectorManualEditImpactLevel): string {
  if (level === "none") {
    return "没有发现影响";
  }
  if (level === "low") {
    return "轻微影响";
  }
  if (level === "medium") {
    return "中等影响";
  }
  return "高影响";
}

function impactVariant(level: DirectorManualEditImpactLevel): "default" | "outline" | "secondary" | "destructive" {
  if (level === "high") {
    return "destructive";
  }
  if (level === "medium") {
    return "secondary";
  }
  if (level === "low") {
    return "default";
  }
  return "outline";
}

function renderImpactResult(impact: DirectorManualEditImpact) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant={impactVariant(impact.impactLevel)}>{formatImpactLevel(impact.impactLevel)}</Badge>
        <Badge variant={impact.safeToContinue ? "default" : "secondary"}>
          {impact.safeToContinue ? "可以继续推进" : "建议先处理影响"}
        </Badge>
        {impact.requiresApproval ? <Badge variant="outline">需要确认</Badge> : null}
      </div>
      <div className="text-sm leading-6 text-muted-foreground">{impact.summary}</div>
      {impact.changedChapters.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">受影响章节</div>
          {impact.changedChapters.slice(0, 4).map((chapter) => (
            <div key={chapter.chapterId} className="rounded-md border bg-background px-3 py-2 text-xs">
              第 {chapter.order} 章：{chapter.title}
            </div>
          ))}
        </div>
      ) : null}
      {impact.minimalRepairPath.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">推荐处理路径</div>
          {impact.minimalRepairPath.map((step, index) => (
            <div key={`${step.action}:${index}`} className="rounded-md border bg-muted/20 px-3 py-2 text-xs leading-5">
              <div className="font-medium text-foreground">{step.label}</div>
              <div className="mt-1 text-muted-foreground">{step.reason}</div>
            </div>
          ))}
        </div>
      ) : null}
      {impact.riskNotes.length > 0 ? (
        <div className="text-xs leading-5 text-muted-foreground">
          风险提示：{impact.riskNotes.join("；")}
        </div>
      ) : null}
    </div>
  );
}

export default function TaskCenterManualEditImpactCard({
  task,
}: TaskCenterManualEditImpactCardProps) {
  const canAnalyze = task.kind === "novel_workflow"
    && task.meta.lane === "auto_director"
    && task.sourceResource?.type === "novel";
  const mutation = useMutation({
    mutationFn: () => getDirectorManualEditImpact(task.ownerId, {
      workflowTaskId: task.id,
      ai: true,
    }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "检查章节改动影响失败");
    },
  });

  useEffect(() => {
    mutation.reset();
  }, [mutation, task.id]);

  if (!canAnalyze) {
    return null;
  }

  const impact = mutation.data?.data?.impact ?? null;
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">章节改动影响</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            检查当前正文和导演运行记录的差异，给出最小复查或修复路径。
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "检查中..." : "检查影响"}
        </Button>
      </div>
      {impact ? renderImpactResult(impact) : null}
    </div>
  );
}
