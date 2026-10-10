import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { DirectorTaskFactInspectionStep } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorStepCalibrationAction, DirectorStepCalibrationRequest } from "@ai-novel/shared/types/novelDirector";
import { getDirectorTaskFactInspection } from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function stepStateLabel(step: DirectorTaskFactInspectionStep): string {
  if (step.isCurrentFactStep) return "当前步骤";
  if (step.completed) return "已有结果";
  if (step.ready) return "可以调整";
  return "等待前置条件";
}

function stepStateVariant(step: DirectorTaskFactInspectionStep): "default" | "secondary" | "outline" | "destructive" {
  if (step.isCurrentFactStep) return "default";
  if (step.completed) return "secondary";
  if (step.ready) return "outline";
  return "destructive";
}

export default function DirectorStepCalibrationDialog(input: {
  taskId: string;
  activeStepId?: string | null;
  enabled: boolean;
  isSubmitting: boolean;
  onSubmit: (request: DirectorStepCalibrationRequest) => void;
}) {
  const { taskId, activeStepId, enabled, isSubmitting, onSubmit } = input;
  const [open, setOpen] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState(activeStepId?.trim() || "");
  const [instruction, setInstruction] = useState("");
  const inspectionQuery = useQuery({
    queryKey: queryKeys.tasks.directorTaskFactInspection(taskId),
    queryFn: () => getDirectorTaskFactInspection(taskId),
    enabled: open && enabled && Boolean(taskId),
    staleTime: 0,
  });
  const steps = inspectionQuery.data?.data?.inspection?.steps ?? [];
  const selectableSteps = useMemo(
    () => steps.filter((step) => step.completed || step.ready || step.isCurrentFactStep),
    [steps],
  );
  const selectedStep = selectableSteps.find((step) => step.stepId === selectedStepId) ?? null;

  useEffect(() => {
    if (!open) return;
    const preferred = selectableSteps.find((step) => step.stepId === activeStepId)
      ?? selectableSteps.find((step) => step.isCurrentFactStep)
      ?? selectableSteps[0];
    if (preferred && !selectableSteps.some((step) => step.stepId === selectedStepId)) {
      setSelectedStepId(preferred.stepId);
    }
  }, [activeStepId, open, selectableSteps, selectedStepId]);

  const submit = (action: DirectorStepCalibrationAction) => {
    if (!selectedStepId || isSubmitting) return;
    onSubmit({
      stepId: selectedStepId,
      action,
      instruction: instruction.trim() || null,
    });
    setOpen(false);
  };

  if (!enabled) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={isSubmitting}>
          <Sparkles className="h-4 w-4" />
          调整其他步骤
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>调整导演步骤</DialogTitle>
          <DialogDescription>
            选择你不满意的步骤，告诉 AI 需要补足的方向。生成后会回到当前审核节点，确认结果后才会继续后续流程。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="director-step-calibration-step" className="text-sm font-medium text-foreground">
              要调整哪一步
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void inspectionQuery.refetch()}
              disabled={inspectionQuery.isFetching}
            >
              {inspectionQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              重新读取
            </Button>
          </div>

          {inspectionQuery.isLoading ? (
            <div className="flex items-center justify-center rounded-xl bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在读取已完成的导演步骤…
            </div>
          ) : inspectionQuery.isError ? (
            <div className="rounded-xl bg-destructive/5 px-4 py-3 text-sm leading-6 text-destructive">
              暂时无法读取步骤清单。{inspectionQuery.error instanceof Error ? inspectionQuery.error.message : "请稍后重试。"}
            </div>
          ) : selectableSteps.length === 0 ? (
            <div className="rounded-xl bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
              当前没有可调整的步骤，请先让导演完成一次步骤检查。
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <select
                  id="director-step-calibration-step"
                  value={selectedStepId}
                  onChange={(event) => setSelectedStepId(event.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {selectableSteps.map((step) => (
                    <option key={step.stepId} value={step.stepId}>
                      {step.label} · {stepStateLabel(step)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
              {selectedStep ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={stepStateVariant(selectedStep)}>{stepStateLabel(selectedStep)}</Badge>
                  <span>{selectedStep.progress?.label || "可以根据你的要求重新整理这一段产出。"}</span>
                </div>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="director-step-calibration-instruction" className="text-sm font-medium text-foreground">
              希望 AI 怎么调整（可选）
            </label>
            <textarea
              id="director-step-calibration-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="例如：保留当前人物动机，只重做第三卷的冲突升级；不要改变已经确认的世界观限制。"
              rows={4}
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => submit("validate")} disabled={!selectedStep || isSubmitting}>
              <Check className="h-4 w-4" />检查这一步
            </Button>
            <Button type="button" variant="outline" onClick={() => submit("improve")} disabled={!selectedStep || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              完善这一步
            </Button>
            <Button type="button" onClick={() => submit("regenerate")} disabled={!selectedStep || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              重新生成这一步
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
