import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoryModeProfile } from "@ai-novel/shared/types/storyMode";
import {
  createStoryModeChildren,
  createStoryModeTree,
  deleteStoryMode,
  flattenStoryModeTreeOptions,
  generateStoryModeChild,
  generateStoryModeTree,
  getStoryModeTree,
  updateStoryMode,
  type StoryModeTreeDraft,
  type StoryModeTreeNode,
} from "@/api/storyMode";
import { queryKeys } from "@/api/queryKeys";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import StoryModeProfileFields from "./components/StoryModeProfileFields";
import StoryModeTreeCard from "./components/StoryModeTreeCard";
import SelectControl from "@/components/common/SelectControl";

type StoryModeProfileDraft = StoryModeProfile;

interface StoryModeDialogState {
  name: string;
  description: string;
  template: string;
  profile: StoryModeProfileDraft;
}

function createEmptyProfile(): StoryModeProfileDraft {
  return {
    coreDrive: "",
    readerReward: "",
    progressionUnits: [],
    allowedConflictForms: [],
    forbiddenConflictForms: [],
    conflictCeiling: "medium",
    resolutionStyle: "",
    chapterUnit: "",
    volumeReward: "",
    mandatorySignals: [],
    antiSignals: [],
  };
}

function createEmptyDraft(): StoryModeTreeDraft {
  return {
    name: "",
    description: "",
    template: "",
    profile: createEmptyProfile(),
    children: [],
  };
}

function cloneDraft(draft: StoryModeTreeDraft): StoryModeTreeDraft {
  return {
    name: draft.name,
    description: draft.description ?? "",
    template: draft.template ?? "",
    profile: { ...draft.profile },
    children: draft.children.map((child) => cloneDraft(child)),
  };
}

function countStoryModes(nodes: StoryModeTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countStoryModes(node.children), 0);
}

function findStoryModeNode(nodes: StoryModeTreeNode[], id: string): StoryModeTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findStoryModeNode(node.children, id);
    if (child) {
      return child;
    }
  }
  return null;
}

function collectDescendantIds(node: StoryModeTreeNode): string[] {
  return node.children.flatMap((child) => [child.id, ...collectDescendantIds(child)]);
}

function normalizeProfileInput(profile: StoryModeDialogState["profile"]): StoryModeProfile {
  return {
    coreDrive: profile.coreDrive.trim(),
    readerReward: profile.readerReward.trim(),
    progressionUnits: profile.progressionUnits,
    allowedConflictForms: profile.allowedConflictForms,
    forbiddenConflictForms: profile.forbiddenConflictForms,
    conflictCeiling: profile.conflictCeiling,
    resolutionStyle: profile.resolutionStyle.trim(),
    chapterUnit: profile.chapterUnit.trim(),
    volumeReward: profile.volumeReward.trim(),
    mandatorySignals: profile.mandatorySignals,
    antiSignals: profile.antiSignals,
  };
}

function toDialogState(node?: StoryModeTreeNode | null): StoryModeDialogState {
  return {
    name: node?.name ?? "",
    description: node?.description ?? "",
    template: node?.template ?? "",
    profile: node?.profile ? { ...node.profile } : createEmptyProfile(),
  };
}

export default function StoryModeManagementPage() {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingStoryModeId, setEditingStoryModeId] = useState("");
  const [defaultParentId, setDefaultParentId] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [childDerivationCount, setChildDerivationCount] = useState(1);
  const [generatedChildCandidates, setGeneratedChildCandidates] = useState<StoryModeTreeDraft[]>([]);
  const [selectedGeneratedChildIndexes, setSelectedGeneratedChildIndexes] = useState<number[]>([]);
  const [activeGeneratedChildIndex, setActiveGeneratedChildIndex] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<StoryModeTreeDraft>(createEmptyDraft());
  const [editState, setEditState] = useState<StoryModeDialogState>(toDialogState());

  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });

  const storyModeTree = storyModeTreeQuery.data?.data ?? [];
  const isCreatingChild = Boolean(defaultParentId);
  const totalStoryModes = useMemo(() => countStoryModes(storyModeTree), [storyModeTree]);
  const editingStoryMode = useMemo(
    () => (editingStoryModeId ? findStoryModeNode(storyModeTree, editingStoryModeId) : null),
    [editingStoryModeId, storyModeTree],
  );
  const parentOptions = useMemo(
    () => flattenStoryModeTreeOptions(storyModeTree).filter((item) => item.level === 0),
    [storyModeTree],
  );
  const blockedParentIds = useMemo(
    () => editingStoryMode ? new Set([editingStoryMode.id, ...collectDescendantIds(editingStoryMode)]) : new Set<string>(),
    [editingStoryMode],
  );

  useEffect(() => {
    if (!createDialogOpen) {
      return;
    }
    setCreateDraft(createEmptyDraft());
    setGenerationPrompt("");
    setChildDerivationCount(1);
    setGeneratedChildCandidates([]);
    setSelectedGeneratedChildIndexes([]);
    setActiveGeneratedChildIndex(null);
  }, [createDialogOpen, defaultParentId]);

  useEffect(() => {
    if (!editingStoryMode) {
      return;
    }
    setEditState(toDialogState(editingStoryMode));
  }, [editingStoryMode]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.storyModes.all });
  };

  const createMutation = useMutation({
    mutationFn: () => createStoryModeTree({
      name: createDraft.name.trim(),
      description: createDraft.description?.trim() || undefined,
      template: createDraft.template?.trim() || undefined,
      profile: normalizeProfileInput(createDraft.profile),
      parentId: defaultParentId || null,
      children: createDraft.children.map((child) => ({
        ...child,
        profile: normalizeProfileInput(child.profile),
      })),
    }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Propulsion pattern created.");
      setCreateDialogOpen(false);
    },
  });

  const createSelectedChildrenMutation = useMutation({
    mutationFn: async () => {
      if (!defaultParentId) {
        throw new Error("Parent push mode does not exist.");
      }

      const drafts = selectedGeneratedChildIndexes
        .map((index) => generatedChildCandidates[index])
        .filter((draft): draft is StoryModeTreeDraft => Boolean(draft))
        .map((draft) => ({
          ...cloneDraft(draft),
          profile: normalizeProfileInput(draft.profile),
          children: [],
        }));

      if (drafts.length === 0) {
        throw new Error("Please select at least one subcategory candidate.");
      }

      return createStoryModeChildren({
        parentId: defaultParentId,
        drafts,
      });
    },
    onSuccess: async (response) => {
      await invalidate();
      const savedCount = response.data?.length ?? selectedGeneratedChildIndexes.length;
      toast.success(`已批量创建 ${savedCount} 个推进模式子类。`);
      setCreateDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingStoryMode) {
        throw new Error("Advance mode does not exist.");
      }
      return updateStoryMode(editingStoryMode.id, {
        name: editState.name.trim(),
        description: editState.description.trim() || null,
        template: editState.template.trim() || null,
        profile: normalizeProfileInput(editState.profile),
      });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Propulsion mode has been updated.");
      setEditingStoryModeId("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStoryMode(id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Push mode has been removed.");
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (): Promise<
      | { kind: "child"; drafts: StoryModeTreeDraft[] }
      | { kind: "tree"; draft: StoryModeTreeDraft | null }
    > => {
      if (isCreatingChild) {
        const response = await generateStoryModeChild({
          parentId: defaultParentId,
          prompt: generationPrompt.trim() || undefined,
          count: childDerivationCount,
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
          maxTokens: llm.maxTokens,
        });
        return {
          kind: "child",
          drafts: response.data ?? [],
        };
      }

      const response = await generateStoryModeTree({
        prompt: generationPrompt.trim(),
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
        maxTokens: llm.maxTokens,
      });
      return {
        kind: "tree",
        draft: response.data ?? null,
      };
    },
    onSuccess: (result) => {
      if (result.kind === "child") {
        const candidates = result.drafts.map((item) => cloneDraft(item));
        if (candidates.length === 0) {
          return;
        }
        setGeneratedChildCandidates(candidates);
        setSelectedGeneratedChildIndexes(candidates.map((_item, index) => index));
        setActiveGeneratedChildIndex(0);
        setCreateDraft(cloneDraft(candidates[0]));
        toast.success(`AI 已生成 ${candidates.length} 个推进模式子类草稿。`);
        return;
      }
      setSelectedGeneratedChildIndexes([]);
      setActiveGeneratedChildIndex(null);
      if (!result.draft) {
        return;
      }
      setGeneratedChildCandidates([]);
      setCreateDraft(cloneDraft(result.draft));
      toast.success("Draft AI propulsion mode tree generated.");
    },
  });

  const handleCreateRoot = () => {
    setDefaultParentId("");
    setCreateDialogOpen(true);
  };

  const handleCreateChild = (parentId: string) => {
    setDefaultParentId(parentId);
    setCreateDialogOpen(true);
  };

  const updateCreateDraft = (updater: (draft: StoryModeTreeDraft) => StoryModeTreeDraft) => {
    setCreateDraft((prev) => {
      const next = updater(prev);
      if (isCreatingChild && activeGeneratedChildIndex !== null) {
        setGeneratedChildCandidates((prevCandidates) => prevCandidates.map((candidate, index) => (
          index === activeGeneratedChildIndex ? cloneDraft(next) : candidate
        )));
      }
      return next;
    });
  };

  const handleApplyGeneratedChild = (draft: StoryModeTreeDraft, index: number) => {
    setActiveGeneratedChildIndex(index);
    setCreateDraft(cloneDraft(draft));
  };

  const handleToggleGeneratedChildSelection = (index: number) => {
    setSelectedGeneratedChildIndexes((prev) => (
      prev.includes(index)
        ? prev.filter((item) => item !== index)
        : [...prev, index].sort((left, right) => left - right)
    ));
  };

  const handleDelete = (node: StoryModeTreeNode) => {
    const descendantCount = collectDescendantIds(node).length;
    const message = descendantCount > 0
      ? `确认删除推进模式「${node.name}」吗？这会同时删除其下 ${descendantCount} 个子类，此操作不可恢复。`
      : `确认删除推进模式「${node.name}」吗？此操作不可恢复。`;
    const confirmed = window.confirm(message);
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(node.id);
  };

  const selectedParentLabel = useMemo(() => {
    if (!defaultParentId) {
      return "Created as root push mode";
    }
    return parentOptions.find((item) => item.id === defaultParentId)?.path ?? "Created as root push mode";
  }, [defaultParentId, parentOptions]);

  const editParentOptions = useMemo(
    () => parentOptions.filter((item) => !blockedParentIds.has(item.id)),
    [blockedParentIds, parentOptions],
  );

  return (
    <div className="space-y-4">
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-auto">
          <DialogHeader>
            <DialogTitle>{isCreatingChild ? "Add a new propulsion mode subclass" : "Create a new propulsion mode"}</DialogTitle>
            <DialogDescription>
              {isCreatingChild ? "Currently, a new subclass will be added under the specified parent class. You can fill it in manually, or you can first let the AI ​​generate multiple subclass candidates based on the parent class and existing sibling nodes, and then save them in batches." : "First determine the mounting location, then manually fill in the profile, or first let the AI ​​generate a two-level tree draft."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="text-sm font-semibold text-foreground">Current mounting location</div>
              <div className="mt-1 text-sm text-muted-foreground">{selectedParentLabel}</div>
            </div>

            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">{isCreatingChild ? "AI Generated Subclass Draft" : "AI Generated Draft"}</div>
                <div className="text-xs leading-5 text-muted-foreground">
                  {isCreatingChild ? "AI will output one or more child node drafts based on the current parent and existing sibling nodes, without generating the entire tree. The supplementary direction can be left blank. The profile structure will still be validated before saving." : "AI will output a directly editable advance mode tree draft; the profile structure will still be validated before saving."}
                </div>
              </div>
              <LLMSelector />
              {isCreatingChild ? (
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">Derived quantity</span>
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={childDerivationCount}
                    onChange={(event) => setChildDerivationCount(Number(event.target.value))}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </SelectControl>
                </label>
              ) : null}
              <textarea
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={generationPrompt}
                onChange={(event) => setGenerationPrompt(event.target.value)}
                placeholder={isCreatingChild
                  ? "Optional: Supplement the subcategory direction you want to prefer. If left blank, the AI ​​will be directly derived based on the parent class and existing sibling nodes."
                  : "Please enter the direction you wish to generate the push mode tree."}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => generateMutation.mutate()}
                  disabled={(!generationPrompt.trim() && !isCreatingChild) || generateMutation.isPending}
                >
                  {generateMutation.isPending ? "Generating..." : isCreatingChild ? "Generating subclass draft" : "Generating advance mode draft"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActiveGeneratedChildIndex(null);
                    setCreateDraft(createEmptyDraft());
                  }}
                >
                  Reset draft
                                                  </Button>
              </div>
              {isCreatingChild && generatedChildCandidates.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-border/70 bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">Generated subcategory candidates</div>
                    <div className="text-xs text-muted-foreground">
                      Selected {selectedGeneratedChildIndexes.length} / {generatedChildCandidates.length}
                    </div>
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    After checking, you can save them in batches; clicking on the candidate card will switch to the form below for individual editing.
                                                        </div>
                  <div className="grid gap-2">
                    {generatedChildCandidates.map((candidate, index) => (
                      <div
                        key={`${candidate.name}-${index}`}
                        className={`rounded-lg border bg-background px-3 py-3 transition ${
                          activeGeneratedChildIndex === index
                            ? "border-primary/60 bg-primary/5"
                            : "border-border/70"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-border"
                            checked={selectedGeneratedChildIndexes.includes(index)}
                            onChange={() => handleToggleGeneratedChildSelection(index)}
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => handleApplyGeneratedChild(candidate, index)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-foreground">{candidate.name}</div>
                              <span className="text-xs text-muted-foreground">
                                {activeGeneratedChildIndex === index ? "Current editor" : `候选 ${index + 1}`}
                              </span>
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {candidate.description?.trim() || candidate.profile.coreDrive}
                            </div>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">name</span>
              <Input value={createDraft.name} onChange={(event) => updateCreateDraft((prev) => ({ ...prev, name: event.target.value }))} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Description</span>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={createDraft.description ?? ""}
                onChange={(event) => updateCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Manual template supplement</span>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={createDraft.template ?? ""}
                onChange={(event) => updateCreateDraft((prev) => ({ ...prev, template: event.target.value }))}
              />
            </label>

            <StoryModeProfileFields
              value={createDraft.profile}
              onChange={(profile) => updateCreateDraft((prev) => ({ ...prev, profile }))}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
                                      </Button>
            {isCreatingChild && generatedChildCandidates.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => createSelectedChildrenMutation.mutate()}
                disabled={createSelectedChildrenMutation.isPending || selectedGeneratedChildIndexes.length === 0} > {createSelectedChildrenMutation.isPending ? "Batch saving in progress..." : `批量保存选中子类 (${selectedGeneratedChildIndexes.length})`}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || createSelectedChildrenMutation.isPending || !createDraft.name.trim()}
            >
              {createMutation.isPending ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : isCreatingChild ? "Save current subclass" : "Save push mode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingStoryMode)} onOpenChange={(open) => { if (!open) setEditingStoryModeId(""); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Edit advance mode</DialogTitle>
            <DialogDescription>
              Name, description, template and profile can be modified. The two-level tree restriction will remain.
                                      </DialogDescription>
          </DialogHeader>

          {editingStoryMode ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                Current parent:{editingStoryMode.parentId ? (editParentOptions.find((item) => item.id === editingStoryMode.parentId)?.path ?? "not found") : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
              </div>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">name</span>
                <Input value={editState.name} onChange={(event) => setEditState((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Description</span>
                <textarea
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={editState.description}
                  onChange={(event) => setEditState((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Manual template supplement</span>
                <textarea
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={editState.template}
                  onChange={(event) => setEditState((prev) => ({ ...prev, template: event.target.value }))}
                />
              </label>
              <StoryModeProfileFields
                value={editState.profile}
                onChange={(profile) => setEditState((prev) => ({ ...prev, profile }))}
              />
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setEditingStoryModeId("")}>
              Cancel
                                      </Button>
            <Button type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !editState.name.trim()}>
              {updateMutation.isPending ? "Saving..." : "Saving changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Advancing Pattern Library</CardTitle>
            <CardDescription>
              The advancement modes of the work are maintained here, such as system flow, invincible flow, farming flow, and daily healing. It answers "what does this book rely on to continue to advance and be realized?" and will serve as a hard constraint input for subsequent planning and generation.
                                      </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-sm text-muted-foreground">Current number of advancement modes:{totalStoryModes}</div>
            <Button type="button" onClick={handleCreateRoot}>
              Create a new propulsion mode tree
                                      </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {storyModeTreeQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading push mode tree...</div>
          ) : null}

          {!storyModeTreeQuery.isLoading && storyModeTree.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <div className="text-sm font-medium text-foreground">There is no push mode yet</div>
              <div className="mt-1 text-sm text-muted-foreground">
                You can manually create a root advancement pattern first, or you can directly let AI generate a structured draft.
                                            </div>
              <div className="mt-4">
                <Button type="button" onClick={handleCreateRoot}>
                  Start creating
                                                  </Button>
              </div>
            </div>
          ) : null}

          {storyModeTree.map((node) => (
            <StoryModeTreeCard
              key={node.id}
              node={node}
              onCreateChild={handleCreateChild}
              onEdit={setEditingStoryModeId}
              onDelete={handleDelete}
              deletingId={deleteMutation.isPending ? deleteMutation.variables : undefined}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
