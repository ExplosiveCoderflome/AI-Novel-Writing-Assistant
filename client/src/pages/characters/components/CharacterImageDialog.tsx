import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import { generateCharacterImages, getImageTask } from "@/api/images";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function buildDefaultImagePrompt(character: BaseCharacter): string {
  const blocks = [
    `${character.name} 的角色形象图`,
    character.role ? `角色定位：${character.role}` : "",
    character.appearance ? `外貌体态：${character.appearance}` : "",
    character.personality ? `性格特征：${character.personality}` : "",
  ];
  return blocks.filter(Boolean).join("\n");
}

const IMAGE_STATUS_TEXT: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "生成成功",
  failed: "生成失败",
  cancelled: "已取消",
};

interface CharacterImageDialogProps {
  open: boolean;
  character: BaseCharacter | null;
  onOpenChange: (open: boolean) => void;
  onTaskCompleted?: (baseCharacterId: string) => void;
}

export function CharacterImageDialog({
  open,
  character,
  onOpenChange,
  onTaskCompleted,
}: CharacterImageDialogProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [imageForm, setImageForm] = useState({
    prompt: "",
    stylePreset: "写实人像",
    negativePrompt: "低清晰度，畸形，多余肢体，文字水印",
    provider: "grok" as "openai" | "siliconflow" | "grok",
    size: "1024x1024" as "512x512" | "768x768" | "1024x1024" | "1024x1536" | "1536x1024",
    count: 2,
  });

  useEffect(() => {
    if (!open || !character) {
      return;
    }
    setActiveTaskId(null);
    setImageForm((prev) => ({
      ...prev,
      prompt: buildDefaultImagePrompt(character),
    }));
  }, [open, character]);

  const activeTaskQuery = useQuery({
    queryKey: queryKeys.images.task(activeTaskId ?? "none"),
    queryFn: () => getImageTask(activeTaskId as string),
    enabled: Boolean(activeTaskId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (!status || status === "queued" || status === "running") {
        return 1500;
      }
      return false;
    },
  });

  useEffect(() => {
    const task = activeTaskQuery.data?.data;
    if (!task || !activeTaskId) {
      return;
    }
    if (task.status === "queued" || task.status === "running") {
      return;
    }
    if (task.baseCharacterId) {
      onTaskCompleted?.(task.baseCharacterId);
    }
    setActiveTaskId(null);
  }, [activeTaskId, activeTaskQuery.data, onTaskCompleted]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!character) {
        throw new Error("请先选择角色。");
      }
      return generateCharacterImages({
        sceneType: "character",
        sceneId: character.id,
        prompt: imageForm.prompt,
        stylePreset: imageForm.stylePreset,
        negativePrompt: imageForm.negativePrompt,
        provider: imageForm.provider,
        size: imageForm.size,
        count: imageForm.count,
      });
    },
    onSuccess: (response) => {
      const taskId = response.data?.id;
      if (taskId) {
        setActiveTaskId(taskId);
      }
    },
  });

  const activeTask = activeTaskQuery.data?.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setActiveTaskId(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="w-[96vw] max-w-[920px]">
        <DialogHeader>
          <DialogTitle>
            生成角色形象图
            {character ? `：${character.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <textarea
            className="min-h-[240px] w-full rounded-md border p-2 text-sm"
            placeholder="输入形象描述（越具体越好）"
            value={imageForm.prompt}
            onChange={(event) => setImageForm((prev) => ({ ...prev, prompt: event.target.value }))}
          />
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-md border p-2 text-sm"
              placeholder="风格预设（如：电影感写实）"
              value={imageForm.stylePreset}
              onChange={(event) => setImageForm((prev) => ({ ...prev, stylePreset: event.target.value }))}
            />
            <input
              className="rounded-md border p-2 text-sm"
              placeholder="负向提示词（避免出现）"
              value={imageForm.negativePrompt}
              onChange={(event) => setImageForm((prev) => ({ ...prev, negativePrompt: event.target.value }))}
            />
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">模型厂商</div>
              <select
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={imageForm.provider}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    provider: event.target.value as "openai" | "siliconflow" | "grok",
                  }))}
              >
                <option value="grok">Grok (xAI)</option>
                <option value="openai">OpenAI</option>
                <option value="siliconflow">SiliconFlow</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">尺寸</div>
              <select
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={imageForm.size}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    size: event.target.value as typeof prev.size,
                  }))}
              >
                <option value="512x512">512x512</option>
                <option value="768x768">768x768</option>
                <option value="1024x1024">1024x1024</option>
                <option value="1024x1536">1024x1536</option>
                <option value="1536x1024">1536x1024</option>
              </select>
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">生成张数</div>
              <select
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={String(imageForm.count)}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    count: Number(event.target.value),
                  }))}
              >
                <option value="1">1 张</option>
                <option value="2">2 张</option>
                <option value="3">3 张</option>
                <option value="4">4 张</option>
              </select>
            </label>
          </div>

          {activeTask ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div>当前任务状态：{IMAGE_STATUS_TEXT[activeTask.status] ?? activeTask.status}</div>
              {activeTask.error ? (
                <div className="mt-1 text-xs text-destructive">{activeTask.error}</div>
              ) : null}
            </div>
          ) : null}

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !imageForm.prompt.trim() || Boolean(activeTaskId)}
          >
            {generateMutation.isPending ? "提交任务中..." : "开始生成"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
