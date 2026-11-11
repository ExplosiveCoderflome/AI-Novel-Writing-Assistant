import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import {
  compareOutlineRevisions,
  getOutlineRevision,
  listOutlineRevisions,
  restoreOutlineRevision,
  type OutlineChange,
} from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { findOutlineNodeTitle, formatOutlineValue, outlineFieldLabels } from "./outlineNodes";

const sourceTypeLabels: Record<string, string> = {
  manual: "手动编辑",
  proposal: "AI 提案采纳",
  import: "导入",
  restore: "历史恢复",
  initial_generation: "初始大纲采纳",
};

const changeKindLabels = {
  added: "新增节点",
  removed: "移除节点",
  updated: "修改字段",
  moved: "移动节点",
} as const;

interface OutlineRevisionPanelProps {
  outlineId: string;
  currentVersion: number;
  document: OutlineDocument;
  onRestored: () => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function nodeRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return record.node && typeof record.node === "object" ? asRecord(record.node) : record;
}

function changeTitle(change: OutlineChange): string {
  const node = nodeRecord(change.after ?? change.before);
  return String(node.title ?? node.name ?? change.nodeId);
}

function VersionSelector({ label, value, versions, onChange }: {
  label: string;
  value: number;
  versions: Array<{ id: string; version: number }>;
  onChange: (version: number) => void;
}) {
  return (
    <label className="block space-y-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      >
        {versions.map(revision => <option key={revision.id} value={revision.version}>修订 v{revision.version}</option>)}
      </select>
    </label>
  );
}

function FieldDiff({ field, before, after, beforeDocument, afterDocument }: { field: string; before: unknown; after: unknown; beforeDocument?: OutlineDocument; afterDocument?: OutlineDocument }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{outlineFieldLabels[field] ?? field}</p>
      <dl className="outline-comparison mt-1">
        <div className="bg-muted/40 p-2"><dt className="text-xs text-muted-foreground">起始版本</dt><dd className="mt-1 whitespace-pre-wrap break-words text-xs">{formatOutlineValue(before, field, beforeDocument)}</dd></div>
        <div className="bg-muted/40 p-2"><dt className="text-xs text-muted-foreground">目标版本</dt><dd className="mt-1 whitespace-pre-wrap break-words text-xs">{formatOutlineValue(after, field, afterDocument)}</dd></div>
      </dl>
    </div>
  );
}

function ChangeDetails({ change, beforeDocument, afterDocument }: { change: OutlineChange; beforeDocument: OutlineDocument; afterDocument: OutlineDocument }) {
  if (change.kind === "moved") {
    const before = asRecord(change.before);
    const after = asRecord(change.after);
    const beforeParent = typeof before.parent === "string" && before.parent !== "story" ? findOutlineNodeTitle(beforeDocument, before.parent) : "总纲";
    const afterParent = typeof after.parent === "string" && after.parent !== "story" ? findOutlineNodeTitle(afterDocument, after.parent) : "总纲";
    return (
      <div className="mt-2 space-y-2">
        {before.parent !== after.parent ? <FieldDiff field="parent" before={beforeParent} after={afterParent} /> : null}
        {before.order !== after.order ? <FieldDiff field="order" before={before.order} after={after.order} /> : null}
      </div>
    );
  }

  const before = nodeRecord(change.before);
  const after = nodeRecord(change.after);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(field => field !== "nodeId")
    .filter(field => change.kind !== "updated" || JSON.stringify(before[field]) !== JSON.stringify(after[field]));
  return (
    <div className="mt-2 space-y-3">
      {fields.map(field => <FieldDiff key={field} field={field} before={before[field]} after={after[field]} beforeDocument={beforeDocument} afterDocument={afterDocument} />)}
    </div>
  );
}

export function OutlineRevisionPanel({ outlineId, currentVersion, document, onRestored }: OutlineRevisionPanelProps) {
  const queryClient = useQueryClient();
  const revisions = useQuery({
    queryKey: ["outline-revisions", outlineId],
    queryFn: () => listOutlineRevisions(outlineId),
  });
  const ordered = useMemo(
    () => [...(revisions.data ?? [])].sort((left, right) => right.version - left.version),
    [revisions.data],
  );
  const [fromSelection, setFromSelection] = useState<number | null>(null);
  const [toSelection, setToSelection] = useState<number | null>(null);
  const fromVersion = fromSelection !== null && ordered.some(item => item.version === fromSelection)
    ? fromSelection
    : ordered[1]?.version ?? ordered[0]?.version ?? 0;
  const toVersion = toSelection !== null && ordered.some(item => item.version === toSelection)
    ? toSelection
    : ordered[0]?.version ?? 0;
  const diff = useQuery({
    queryKey: ["outline-diff", outlineId, fromVersion, toVersion],
    queryFn: () => compareOutlineRevisions(outlineId, fromVersion, toVersion),
    enabled: ordered.length > 1 && fromVersion > 0 && toVersion > 0 && fromVersion !== toVersion,
  });
  const fromRevision = ordered.find(item => item.version === fromVersion);
  const toRevision = ordered.find(item => item.version === toVersion);
  const before = useQuery({ queryKey: ["outline-revision", outlineId, fromRevision?.id], queryFn: () => getOutlineRevision(outlineId, fromRevision!.id), enabled: !!fromRevision });
  const after = useQuery({ queryKey: ["outline-revision", outlineId, toRevision?.id], queryFn: () => getOutlineRevision(outlineId, toRevision!.id), enabled: !!toRevision });
  const restore = useMutation({
    mutationFn: (revisionId: string) => restoreOutlineRevision(outlineId, revisionId, currentVersion),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["outline-revisions", outlineId] });
      onRestored();
    },
  });

  return (
    <section className="space-y-4 border-t border-border/50 pt-4">
      <div>
        <h3 className="font-medium">修订历史</h3>
        <p className="mt-1 text-xs text-muted-foreground">选择任意两版查看差异，或把旧版内容恢复为一个新修订。</p>
      </div>

      {revisions.isLoading ? <p className="text-sm text-muted-foreground">正在读取修订历史…</p> : null}
      {revisions.isError ? <p role="alert" className="text-sm text-destructive">修订历史读取失败，请稍后重试。</p> : null}

      {ordered.length ? (
        <>
          <ol className="space-y-2 text-sm">
            {ordered.map(revision => (
              <li key={revision.id} className="flex items-baseline justify-between gap-3">
                <span>v{revision.version} · {sourceTypeLabels[revision.sourceType] ?? revision.sourceType}</span>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleDateString()}</time>
              </li>
            ))}
          </ol>

          <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-4">
            <VersionSelector label="起始版本" value={fromVersion} versions={ordered} onChange={setFromSelection} />
            <VersionSelector label="目标版本" value={toVersion} versions={ordered} onChange={setToSelection} />
          </div>

          {fromVersion === toVersion ? <p className="text-xs text-muted-foreground">请选择两个不同版本进行比较。</p> : null}
          {ordered.length < 2 ? <p className="text-xs text-muted-foreground">保存另一个修订后，就可以比较两版内容。</p> : null}
          {diff.isLoading || before.isLoading || after.isLoading ? <p className="text-sm text-muted-foreground">正在比较所选修订…</p> : null}
          {diff.isError || before.isError || after.isError ? <p role="alert" className="text-sm text-destructive">差异读取失败，请重新选择版本。</p> : null}
          {diff.data && !diff.data.length ? <p className="text-sm text-muted-foreground">两版之间没有内容差异。</p> : null}
          {diff.data?.length && before.data && after.data ? (
            <ul className="space-y-4">
              {diff.data.map(change => (
                <li key={`${change.kind}-${change.nodeId}`} className="bg-muted/25 p-3">
                  <p className="text-sm font-medium">{changeKindLabels[change.kind]} · {changeTitle(change)}</p>
                  <ChangeDetails change={change} beforeDocument={before.data?.document ?? document} afterDocument={after.data?.document ?? document} />
                </li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-2 border-t border-border/50 pt-4">
            <Button
              className="w-full"
              variant="secondary"
              disabled={!fromRevision || fromVersion === currentVersion || restore.isPending}
              onClick={() => fromRevision && restore.mutate(fromRevision.id)}
            >
              将 v{fromVersion} 恢复为新修订
            </Button>
            <p className="text-xs text-muted-foreground">恢复会保留当前内容和全部历史，不会删除中间修订。</p>
            {restore.isError ? <p role="alert" className="text-xs text-destructive">{restore.error instanceof Error ? restore.error.message : "恢复失败，请刷新后重试。"}</p> : null}
            {restore.isSuccess ? <p className="text-xs text-green-700 dark:text-green-400">旧版内容已恢复为新的当前修订。</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
