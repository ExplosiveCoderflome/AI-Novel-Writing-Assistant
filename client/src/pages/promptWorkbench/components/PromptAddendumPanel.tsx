import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Power, Save, Trash2 } from "lucide-react";
import { getNovelList } from "@/api/novel/core";
import {
  deletePromptAddendum,
  getPromptAddendums,
  savePromptAddendum,
  setPromptAddendumEnabled,
  type PromptAddendum,
  type PromptAddendumPayload,
  type PromptCatalogItem,
} from "@/api/promptWorkbench";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AddendumFormState {
  id?: string;
  title: string;
  content: string;
  enabled: boolean;
}

const EMPTY_GLOBAL_FORM: AddendumFormState = {
  title: "全局补充要求",
  content: "",
  enabled: true,
};

const EMPTY_NOVEL_FORM: AddendumFormState = {
  title: "本书补充要求",
  content: "",
  enabled: true,
};

function toForm(row: PromptAddendum | undefined, fallback: AddendumFormState): AddendumFormState {
  if (!row) {
    return fallback;
  }
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    enabled: row.enabled,
  };
}

function buildParamsKey(promptId: string, novelId: string): string {
  return JSON.stringify({ promptId, novelId: novelId || undefined });
}

function AddendumEditor({
  title,
  description,
  disabled,
  form,
  active,
  pending,
  onChange,
  onSave,
  onToggle,
  onDelete,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  form: AddendumFormState;
  active: boolean;
  pending?: boolean;
  onChange: (next: AddendumFormState) => void;
  onSave: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn("rounded-md border p-4", disabled && "opacity-60")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <Badge variant={active ? "default" : "secondary"}>
              {active ? "已启用" : "未启用"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onToggle} disabled={disabled || !form.id || pending}>
            <Power className="mr-2 h-4 w-4" />
            {active ? "停用" : "启用"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDelete} disabled={disabled || !form.id || pending}>
            <Trash2 className="mr-2 h-4 w-4" />
            删除
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Input
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
          disabled={disabled || pending}
          placeholder="补充要求标题"
        />
        <textarea
          value={form.content}
          onChange={(event) => onChange({ ...form, content: event.target.value })}
          disabled={disabled || pending}
          placeholder="写入希望模型长期遵守的补充要求，例如文风偏好、禁用表达、审校重点或修复保留原则。"
          className="min-h-36 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          maxLength={4000}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-muted-foreground">
            {form.content.trim().length}/4000 字。补充要求会作为上下文追加，不会修改内置提示词。
          </div>
          <Button type="button" onClick={onSave} disabled={disabled || pending || form.content.trim().length === 0}>
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PromptAddendumPanel({ prompt }: { prompt: PromptCatalogItem }) {
  const queryClient = useQueryClient();
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [globalForm, setGlobalForm] = useState<AddendumFormState>(EMPTY_GLOBAL_FORM);
  const [novelForm, setNovelForm] = useState<AddendumFormState>(EMPTY_NOVEL_FORM);

  const paramsKey = useMemo(() => buildParamsKey(prompt.id, selectedNovelId), [prompt.id, selectedNovelId]);
  const addendumQueryKey = queryKeys.promptWorkbench.addendums(paramsKey);

  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 50),
    queryFn: () => getNovelList({ page: 1, limit: 50 }),
    staleTime: 60_000,
  });

  const addendumsQuery = useQuery({
    queryKey: addendumQueryKey,
    queryFn: () => getPromptAddendums({
      promptId: prompt.id,
      novelId: selectedNovelId || undefined,
    }),
    enabled: prompt.addendumSupported,
    staleTime: 15_000,
  });

  const addendums = addendumsQuery.data?.data ?? [];
  const globalAddendum = addendums.find((item) => item.scope === "global");
  const novelAddendum = addendums.find((item) => item.scope === "novel" && item.novelId === selectedNovelId);

  useEffect(() => {
    setGlobalForm(toForm(globalAddendum, EMPTY_GLOBAL_FORM));
    setNovelForm(toForm(novelAddendum, EMPTY_NOVEL_FORM));
  }, [globalAddendum?.id, globalAddendum?.updatedAt, novelAddendum?.id, novelAddendum?.updatedAt, prompt.id]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: addendumQueryKey });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: PromptAddendumPayload) => savePromptAddendum(payload),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setPromptAddendumEnabled(id, enabled),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePromptAddendum(id),
    onSuccess: invalidate,
  });

  const pending = saveMutation.isPending || toggleMutation.isPending || deleteMutation.isPending;
  const novels = novelsQuery.data?.data?.items ?? [];

  if (!prompt.addendumSupported) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        这个提示词不接收自定义补充要求。内置提示词仍可查看，真实调用不会读取这里的补充内容。
      </div>
    );
  }

  const saveGlobal = () => saveMutation.mutate({
    id: globalForm.id,
    scope: "global",
    promptId: prompt.id,
    title: globalForm.title,
    content: globalForm.content,
    enabled: globalForm.enabled,
  });

  const saveNovel = () => saveMutation.mutate({
    id: novelForm.id,
    scope: "novel",
    novelId: selectedNovelId,
    promptId: prompt.id,
    title: novelForm.title,
    content: novelForm.content,
    enabled: novelForm.enabled,
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-md border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            实际生效顺序
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            启用后，系统会先追加全局补充要求，再追加本书补充要求。内置提示词、结构化输出和工具边界保持不变。
          </p>
        </div>
        <select
          value={selectedNovelId}
          onChange={(event) => setSelectedNovelId(event.target.value)}
          className="h-11 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">选择小说后编辑本书补充</option>
          {novels.map((novel) => (
            <option key={novel.id} value={novel.id}>
              {novel.title || novel.id}
            </option>
          ))}
        </select>
      </div>

      <AddendumEditor
        title="全局补充要求"
        description="适合写所有小说都希望遵守的风格偏好、禁用表达和审校重点。"
        form={globalForm}
        active={Boolean(globalAddendum?.enabled)}
        pending={pending}
        onChange={setGlobalForm}
        onSave={saveGlobal}
        onToggle={() => globalForm.id && toggleMutation.mutate({ id: globalForm.id, enabled: !globalAddendum?.enabled })}
        onDelete={() => globalForm.id && deleteMutation.mutate(globalForm.id)}
      />

      <AddendumEditor
        title="本书补充要求"
        description="适合写当前小说独有的写法偏好、禁忌、人物表达边界和修文保留原则。"
        disabled={!selectedNovelId}
        form={novelForm}
        active={Boolean(novelAddendum?.enabled)}
        pending={pending}
        onChange={setNovelForm}
        onSave={saveNovel}
        onToggle={() => novelForm.id && toggleMutation.mutate({ id: novelForm.id, enabled: !novelAddendum?.enabled })}
        onDelete={() => novelForm.id && deleteMutation.mutate(novelForm.id)}
      />
    </div>
  );
}
