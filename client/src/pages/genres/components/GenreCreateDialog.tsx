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
import SelectControl from "@/components/common/SelectControl";

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
      toast.success("The theme base tree has been created.");
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
      toast.success("The AI ​​theme base tree has been generated.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Create a new theme base tree</DialogTitle>
          <DialogDescription>
            Determine the parent position first, then fill in the structure manually or let AI generate a draft. What is maintained here is the subject matter foundation of the work, that is, "what kind of book is this?"
                                </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">AI generation</div>
              <div className="text-xs leading-5 text-muted-foreground">
                It is suitable to type out the basics of major categories, subcategories and lower-level themes together, and then manually fine-tune them.
                                            </div>
            </div>
            <LLMSelector />
            <textarea
              rows={4}
              className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={generationPrompt}
              placeholder="For example: I want to make a female-oriented urban extraordinary growth line. The core selling points are identity reversal, power management and high-emotion relationship pulling."
              onChange={(event) => setGenerationPrompt(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !generationPrompt.trim()}
              >
                {generateMutation.isPending ? "Generating..." : "Generating theme base tree"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(createEmptyGenreDraft())}
              >
                Reset draft
                                            </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="genre-parent" className="text-sm font-medium text-foreground">
              Parent theme base
                                      </label>
            <SelectControl
              id="genre-parent"
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">No parent, created as root theme base</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.path}
                </option>
              ))}
            </SelectControl>
          </div>

          <GenreTreeEditor value={draft} onChange={setDraft} />
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
                                </Button>
          <Button type="button" onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Save theme base tree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
