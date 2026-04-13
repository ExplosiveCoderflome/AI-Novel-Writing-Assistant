import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createGenreTree, generateGenreTree, type GenreOption, type GenreTreeDraft } from "@/api/genre";
import { queryKeys } from "@/api/queryKeys";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import GenreTreeEditor from "./GenreTreeEditor";
import { cloneGenreDraft, createEmptyGenreDraft } from "../genreManagement.shared";

interface GenreCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentOptions: GenreOption[];
  defaultParentId?: string;
}

function normalizeDraftForSubmit(draft: GenreTreeDraft): GenreTreeDraft {
  return {
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
    children: draft.children
      .map((child) => normalizeDraftForSubmit(child))
      .filter((child) => child.name),
  };
}

export default function GenreCreateDialog({
  open,
  onOpenChange,
  parentOptions,
  defaultParentId,
}: GenreCreateDialogProps) {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [draft, setDraft] = useState<GenreTreeDraft>(createEmptyGenreDraft());
  const [generationPrompt, setGenerationPrompt] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setParentId(defaultParentId ?? "");
    setDraft(createEmptyGenreDraft());
    setGenerationPrompt("");
  }, [defaultParentId, open]);

  const canSubmit = useMemo(() => draft.name.trim().length > 0, [draft.name]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizeDraftForSubmit(draft);
      return createGenreTree({
        name: normalized.name,
        description: normalized.description,
        parentId: parentId || null,
        children: normalized.children,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.genres.all });
      toast.success("题材基底树已创建。");
      onOpenChange(false);
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateGenreTree({
      prompt: generationPrompt.trim(),
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      maxTokens: llm.maxTokens,
    }),
    onSuccess: (response) => {
      if (!response.data) {
        return;
      }
      setDraft(cloneGenreDraft(response.data));
      toast.success("AI 题材基底树已生成。");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
        <DialogHeader>
          <DialogTitle>新建题材基底树</DialogTitle>
          <DialogDescription>
            先确定父级位置，再手动填写结构或让 AI 先生成一个草稿。这里维护的是作品的题材基底，也就是“这是什么书”。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">AI 生成</div>
              <div className="text-xs leading-5 text-muted-foreground">
                适合先把大类、子类和下级题材基底一起打出来，再手动微调。
              </div>
            </div>
            <LLMSelector />
            <textarea
              rows={4}
              className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={generationPrompt}
              placeholder="例如：我想做偏女性向的都市超凡成长线，核心卖点是身份反转、势力经营和高情绪关系拉扯。"
              onChange={(event) => setGenerationPrompt(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !generationPrompt.trim()}
              >
                {generateMutation.isPending ? "生成中..." : "生成题材基底树"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(createEmptyGenreDraft())}
              >
                重置草稿
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="genre-parent" className="text-sm font-medium text-foreground">
              父级题材基底
            </label>
            <select
              id="genre-parent"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">无父级，作为根题材基底创建</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.path}
                </option>
              ))}
            </select>
          </div>

          <GenreTreeEditor value={draft} onChange={setDraft} />
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? "保存中..." : "保存题材基底树"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
