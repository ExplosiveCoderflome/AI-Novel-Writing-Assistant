import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { StoryModeProfile } from "@ai-novel/shared/types/storyMode";
import {
  createStoryModeTree,
  deleteStoryMode,
  flattenStoryModeTreeOptions,
  generateStoryModeTree,
  getStoryModeTree,
  updateStoryMode,
  type StoryModeOption,
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

function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToLines(value: string[]): string {
  return value.join("\n");
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

function StoryModeProfileFields(props: {
  value: StoryModeProfileDraft;
  onChange: (value: StoryModeProfileDraft) => void;
}) {
  const { value, onChange } = props;
  const updateList = (field: keyof Pick<
    StoryModeProfileDraft,
    "progressionUnits" | "allowedConflictForms" | "forbiddenConflictForms" | "mandatorySignals" | "antiSignals"
  >, text: string) => {
    onChange({
      ...value,
      [field]: linesToList(text),
    });
  };

  return (
    <div className="grid gap-3">
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">核心驱动</span>
        <textarea
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={value.coreDrive}
          onChange={(event) => onChange({ ...value, coreDrive: event.target.value })}
        />
      </label>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">读者奖励</span>
        <textarea
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={value.readerReward}
          onChange={(event) => onChange({ ...value, readerReward: event.target.value })}
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">章节推进单位</span>
          <textarea
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={listToLines(value.progressionUnits)}
            onChange={(event) => updateList("progressionUnits", event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">允许冲突形式</span>
          <textarea
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={listToLines(value.allowedConflictForms)}
            onChange={(event) => updateList("allowedConflictForms", event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">禁止冲突形式</span>
          <textarea
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={listToLines(value.forbiddenConflictForms)}
            onChange={(event) => updateList("forbiddenConflictForms", event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">冲突上限</span>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={value.conflictCeiling}
            onChange={(event) => onChange({ ...value, conflictCeiling: event.target.value as StoryModeProfile["conflictCeiling"] })}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">化解方式</span>
          <textarea
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={value.resolutionStyle}
            onChange={(event) => onChange({ ...value, resolutionStyle: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">章节颗粒</span>
          <textarea
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={value.chapterUnit}
            onChange={(event) => onChange({ ...value, chapterUnit: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">卷末奖励</span>
          <textarea
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={value.volumeReward}
            onChange={(event) => onChange({ ...value, volumeReward: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">必须出现的信号</span>
          <textarea
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={listToLines(value.mandatorySignals)}
            onChange={(event) => updateList("mandatorySignals", event.target.value)}
          />
        </label>
      </div>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">必须避免的跑偏信号</span>
        <textarea
          rows={4}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={listToLines(value.antiSignals)}
          onChange={(event) => updateList("antiSignals", event.target.value)}
        />
      </label>
    </div>
  );
}

function StoryModeTreeCard(props: {
  node: StoryModeTreeNode;
  depth?: number;
  onCreateChild: (parentId: string) => void;
  onEdit: (storyModeId: string) => void;
  onDelete: (node: StoryModeTreeNode) => void;
  deletingId?: string;
}) {
  const { node, depth = 0, onCreateChild, onEdit, onDelete, deletingId } = props;
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const deleteDisabled = node.childCount > 0 || node.novelCount > 0;

  return (
    <div className={depth > 0 ? "ml-4 border-l border-border/60 pl-4" : ""}>
      <Card className="border-border/70 bg-background/80 p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/40"
            onClick={() => {
              if (hasChildren) {
                setExpanded((value) => !value);
              }
            }}
          >
            {hasChildren ? (
              expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-foreground">{node.name}</div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                小说 {node.novelCount}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                子类 {node.childCount}
              </span>
            </div>
            <div className="text-sm leading-6 text-muted-foreground">
              {node.description?.trim() || node.profile.coreDrive}
            </div>
            <div className="text-xs leading-5 text-muted-foreground">
              核心驱动：{node.profile.coreDrive}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {depth === 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onCreateChild(node.id)}>
                <Plus className="mr-1 h-4 w-4" />
                新增子类
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(node.id)}>
              <Pencil className="mr-1 h-4 w-4" />
              编辑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={deleteDisabled || deletingId === node.id}
              onClick={() => onDelete(node)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {deletingId === node.id ? "删除中..." : "删除"}
            </Button>
          </div>
        </div>
      </Card>

      {hasChildren && expanded ? (
        <div className="mt-3 space-y-3">
          {node.children.map((child) => (
            <StoryModeTreeCard
              key={child.id}
              node={child}
              depth={depth + 1}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onDelete={onDelete}
              deletingId={deletingId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function StoryModeManagementPage() {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingStoryModeId, setEditingStoryModeId] = useState("");
  const [defaultParentId, setDefaultParentId] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [createDraft, setCreateDraft] = useState<StoryModeTreeDraft>(createEmptyDraft());
  const [editState, setEditState] = useState<StoryModeDialogState>(toDialogState());

  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });

  const storyModeTree = storyModeTreeQuery.data?.data ?? [];
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
      toast.success("流派模式已创建。");
      setCreateDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingStoryMode) {
        throw new Error("流派模式不存在。");
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
      toast.success("流派模式已更新。");
      setEditingStoryModeId("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStoryMode(id),
    onSuccess: async () => {
      await invalidate();
      toast.success("流派模式已删除。");
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateStoryModeTree({
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
      setCreateDraft(cloneDraft(response.data));
      toast.success("AI 流派模式草稿已生成。");
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

  const handleDelete = (node: StoryModeTreeNode) => {
    const confirmed = window.confirm(`确认删除流派模式「${node.name}」吗？此操作不可恢复。`);
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(node.id);
  };

  const selectedParentLabel = useMemo(() => {
    if (!defaultParentId) {
      return "作为根流派模式创建";
    }
    return parentOptions.find((item) => item.id === defaultParentId)?.path ?? "作为根流派模式创建";
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
            <DialogTitle>新建流派模式</DialogTitle>
            <DialogDescription>
              先确定挂载位置，再手动填写 profile，或者先让 AI 生成一份两级树草稿。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="text-sm font-semibold text-foreground">当前挂载位置</div>
              <div className="mt-1 text-sm text-muted-foreground">{selectedParentLabel}</div>
            </div>

            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">AI 生成草稿</div>
                <div className="text-xs leading-5 text-muted-foreground">
                  AI 会输出一个可直接编辑的流派模式树草稿，保存前仍然会校验 profile 结构。
                </div>
              </div>
              <LLMSelector />
              <textarea
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={generationPrompt}
                onChange={(event) => setGenerationPrompt(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => generateMutation.mutate()}
                  disabled={!generationPrompt.trim() || generateMutation.isPending}
                >
                  {generateMutation.isPending ? "生成中..." : "生成流派模式草稿"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setCreateDraft(createEmptyDraft())}>
                  重置草稿
                </Button>
              </div>
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">名称</span>
              <Input value={createDraft.name} onChange={(event) => setCreateDraft((prev) => ({ ...prev, name: event.target.value }))} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">描述</span>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={createDraft.description ?? ""}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">人工模板补充</span>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={createDraft.template ?? ""}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, template: event.target.value }))}
              />
            </label>

            <StoryModeProfileFields
              value={createDraft.profile}
              onChange={(profile) => setCreateDraft((prev) => ({ ...prev, profile }))}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !createDraft.name.trim()}>
              {createMutation.isPending ? "保存中..." : "保存流派模式"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingStoryMode)} onOpenChange={(open) => { if (!open) setEditingStoryModeId(""); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
          <DialogHeader>
            <DialogTitle>编辑流派模式</DialogTitle>
            <DialogDescription>
              可以修改名称、描述、模板和 profile。两级树限制仍会保留。
            </DialogDescription>
          </DialogHeader>

          {editingStoryMode ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                当前父级：{editingStoryMode.parentId ? (editParentOptions.find((item) => item.id === editingStoryMode.parentId)?.path ?? "未找到") : "根节点"}
              </div>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">名称</span>
                <Input value={editState.name} onChange={(event) => setEditState((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">描述</span>
                <textarea
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={editState.description}
                  onChange={(event) => setEditState((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">人工模板补充</span>
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
              取消
            </Button>
            <Button type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !editState.name.trim()}>
              {updateMutation.isPending ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>流派模式管理</CardTitle>
            <CardDescription>
              这里维护独立于作品类型的“另一维度类型”，例如无敌流、种田流、搞笑流、治愈日常。它们会作为后续规划和生成的硬约束输入。
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-sm text-muted-foreground">当前流派模式数：{totalStoryModes}</div>
            <Button type="button" onClick={handleCreateRoot}>
              新建流派模式树
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {storyModeTreeQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">正在加载流派模式树...</div>
          ) : null}

          {!storyModeTreeQuery.isLoading && storyModeTree.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <div className="text-sm font-medium text-foreground">还没有任何流派模式</div>
              <div className="mt-1 text-sm text-muted-foreground">
                可以先手动建一个根流派模式，也可以直接让 AI 生成一份结构化草稿。
              </div>
              <div className="mt-4">
                <Button type="button" onClick={handleCreateRoot}>
                  开始创建
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
