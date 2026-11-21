import { BeatList } from "./workspace/volumeRhythm/BeatList";
import type { VolumeBeat } from "@ai-novel/shared/types/novel";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOutlineRevision, listOutlineRevisions } from "@/api/outlines";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type {
  OutlineInitialProposalPayload,
  OutlineProposal,
  OutlineProposalOperation,
} from "@/api/outlines";
import { Button } from "@/components/ui/button";
import {
  findMissingOperationDependencies,
  canApplyOperationSelection,
} from "./outlineProposalSelection";
import { InitialDraftReading } from "./workspace/InitialDraftReading";
import {
  findOutlineNode,
  findOutlineNodeTitle,
  formatOutlineValue,
  outlineFieldLabels,
  localizeOutlineText,
} from "./outlineNodes";

const operationKindLabels = {
  add_node: "新增",
  update_fields: "修改",
  remove_node: "移除",
  move_node: "移动",
} as const;

const nodeTypeLabels = {
  volume: "卷",
  chapter: "章节",
  character: "人物",
  payoff: "伏笔或钩子",
  fact: "固定设定",
} as const;

interface OutlineProposalPanelProps {
  round?: number;
  proposal: OutlineProposal;
  document: OutlineDocument;
  isApplying: boolean;
  applyDisabled?: boolean;
  readOnly?: boolean;
  appliedIds?: string[];
  renderContext?: (base: OutlineDocument) => ReactNode;
  onApply: (operationIds: string[]) => void;
  currentVersion: number;
  personName?: string;
  onLater: () => void;
}

function operationTitle(operation: OutlineProposalOperation, document: OutlineDocument): string {
  const targetTitle = operation.nodeId ? findOutlineNodeTitle(document, operation.nodeId) : "";
  if (operation.kind === "add_node") {
    const title = operation.fields?.title ?? operation.fields?.name ?? "新节点";
    return `新增${operation.nodeType ? nodeTypeLabels[operation.nodeType] : "节点"}「${String(title)}」`;
  }
  return `${operationKindLabels[operation.kind]}「${targetTitle || "节点"}」`;
}

function FieldChanges({ operation, document, titles, current, version, oldVersion, historical }: { historical: boolean; current?: OutlineDocument; version: number; oldVersion?: number; operation: OutlineProposalOperation; document: OutlineDocument; titles: Record<string, string> }) {
  const target = operation.nodeId ? findOutlineNode(document, operation.nodeId) : undefined;
  const targetRecord = target as unknown as Record<string, unknown> | undefined;
  const live = current && operation.nodeId ? findOutlineNode(current, operation.nodeId) as unknown as Record<string, unknown> | undefined : undefined;
  if (operation.kind === "move_node") {
    return (
      <dl className="outline-comparison text-xs">
        <div><dt className="text-muted-foreground">{current ? `当前稿 v${version} 所属卷` : "原所属卷"}</dt><dd className="mt-1 whitespace-pre-wrap">{(current ? live : targetRecord)?.volumeNodeId ? findOutlineNodeTitle(current ?? document, String((current ? live : targetRecord)?.volumeNodeId)) : "（空）"}</dd></div>
        <div><dt className="text-muted-foreground">{current ? "旧建议所属卷" : "调整后所属卷"}</dt><dd className="mt-1 whitespace-pre-wrap">{operation.parentNodeId ? findOutlineNodeTitle(document, operation.parentNodeId) : "（空）"}</dd></div>
      </dl>
    );
  }
  if (operation.kind === "remove_node") {
    return <p className="text-xs text-muted-foreground">采纳后，这个节点及其字段将从新修订中移除。</p>;
  }
  const fields = Object.entries(operation.fields ?? {});
  if (!fields.length) return null;
  return (
    <div className="space-y-2">
      {fields.map(([field, after]) => (
        <div key={field} className="text-xs">
          <p className="font-medium text-muted-foreground">{outlineFieldLabels[field] ?? field}</p>
          <dl className="outline-comparison mt-1">
            <div className="bg-muted/40 p-2"><dt className="text-muted-foreground">{historical ? "当时的原稿" : "当前稿"} v{version}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{formatOutlineValue((current ? live : targetRecord)?.[field], field, current ?? document)}</dd></div>
            <div className="bg-muted/40 p-2"><dt className="text-muted-foreground">{current ? `旧建议 · 基于 v${oldVersion}` : "建议稿"}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{formatOutlineValue(after, field, document, titles)}</dd></div>
          </dl>
          {current && <details className="outline-base-text"><summary>查看 v{oldVersion} 当时的原文</summary><p>{formatOutlineValue(targetRecord?.[field], field, document)}</p></details>}
        </div>
      ))}
    </div>
  );
}

export function OutlineProposalPanel({ proposal, document: currentDocument, isApplying, applyDisabled, readOnly, appliedIds, renderContext, onApply, onLater, currentVersion, personName, round }: OutlineProposalPanelProps) {
  const revisions = useQuery({ queryKey: ["outline-revisions", proposal.projectId], queryFn: () => listOutlineRevisions(proposal.projectId) });
  const baseRevision = revisions.data?.find(item => item.version === proposal.baseVersion);
  const base = useQuery({ queryKey: ["outline-revision", proposal.projectId, baseRevision?.id], queryFn: () => getOutlineRevision(proposal.projectId, baseRevision!.id), enabled: !!baseRevision });
  const document = base.data?.document ?? currentDocument;
  const payload = useMemo(
    () => JSON.parse(proposal.proposalJson) as OutlineInitialProposalPayload | { operations: OutlineProposalOperation[] },
    [proposal.proposalJson],
  );
  const stale = proposal.status === "pending" && proposal.baseVersion !== currentVersion;
  const replacesOutline = proposal.kind === "initial_generation" && (Object.entries(document.story).some(([key, value]) =>
    key !== "title" && key !== "nodeId" && Boolean(value)) || [document.volumes, document.chapters, document.characters, document.payoffs, document.facts].some(group => group.length));
  const operations = "operations" in payload ? payload.operations : [];
  const titles: Record<string, string> = {};
  for (const operation of operations) {
    const title = operation.fields?.title ?? operation.fields?.name;
    if (typeof title === "string") {
      if (operation.nodeId) titles[operation.nodeId] = title;
      if (operation.clientRef) titles[operation.clientRef] = title;
    }
  }
  const operationTitles = Object.fromEntries(operations.map(operation => [operation.operationId, operationTitle(operation, document)]));
  const displayText = (text: string) => localizeOutlineText(text, operationTitles);
  const allOperationIds = useMemo(() => operations.map(operation => operation.operationId), [operations]);
  const [selectedIds, setSelectedIds] = useState<string[]>(allOperationIds);
  const selected = new Set(selectedIds);
  const missingDependencies = findMissingOperationDependencies(operations, selectedIds);
  const allMissingDependencies = findMissingOperationDependencies(operations, allOperationIds);
  const selectedIsComplete = canApplyOperationSelection(operations, selectedIds);

  const only = operations.find(op => selected.has(op.operationId));
  const personFields = personName && selectedIds.length === 1 && only?.kind === "update_fields"
    && document.characters.some(p => p.nodeId === only.nodeId && p.name === personName) ? Object.keys(only.fields ?? {}).length : 0;
  const toggleOperation = (operationId: string) => {
    setSelectedIds(current => current.includes(operationId)
      ? current.filter(id => id !== operationId)
      : [...current, operationId]);
  };

  const dependencyName = (operationId: string) => {
    const dependency = operations.find(operation => operation.operationId === operationId);
    return dependency ? operationTitle(dependency, document) : "相关修改";
  };

  if (revisions.isLoading || base.isLoading) return <p className="text-sm text-muted-foreground">正在读取提案基准修订…</p>;
  if (revisions.isError || base.isError || !base.data) return <p role="alert" className="text-sm text-destructive">未能读取当时的大纲。<button className="underline" onClick={() => { void revisions.refetch(); if (baseRevision) void base.refetch(); }}>重新读取</button></p>;

  if (proposal.kind === "volume_beats") {
    const sheet = operations.find(op => Array.isArray(op.fields?.beats));
    const volume = document.volumes.find(v=>v.nodeId===sheet?.nodeId);
    if (!sheet || !volume) return <p role="alert">无法读取本卷节奏建议。</p>;
    const assigned = new Map(operations.map(op=>[op.nodeId,op.fields?.beatKey as string | undefined]));
    const chapters = document.chapters.filter(ch=>ch.volumeNodeId===volume.nodeId).sort((a,b)=>a.order-b.order);
    const current = currentDocument.volumes.find(v=>v.nodeId===volume.nodeId);
    return <section className="outline-proposal-body"><h3>建议的卷内节奏与章节归属</h3>
      <BeatList beats={sheet.fields!.beats as VolumeBeat[]} chapters={chapters.map(ch=>({...ch,beatKey:assigned.get(ch.nodeId)}))}/>
      {current?.beats && <details className="outline-volume"><summary>对照当前稿节奏</summary><BeatList beats={current.beats} chapters={currentDocument.chapters.filter(c=>c.volumeNodeId===current.nodeId)}/></details>}
      {!readOnly && <Button disabled={applyDisabled || isApplying} onClick={()=>onApply(allOperationIds)}>采纳本卷节奏与章节归属</Button>}
    </section>;
  }
  return (
    <section className="space-y-4 outline-proposal-body">
      <div>
        <p className="mt-1 text-xs text-muted-foreground">{round && `第 ${round} 轮 · `}基于修订 v{proposal.baseVersion}。{stale ? "展开每一项可以查看当时的原文。" : readOnly ? "可对照当时的修改内容。" : "operations" in payload ? "选中想保留的修改，再一起采纳。" : replacesOutline ? `采纳会替换《${document.story.title}》的整份大纲。原稿 v${proposal.baseVersion} 会保留在版本历史中。` : "检查故事安排，采纳后即可逐项编辑。"}</p>
      </div>

      {"operations" in payload ? (
        <>
          {!readOnly && operations.length > 1 && <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">已选择 {selectedIds.length} / {operations.length} 项</span>
            <Button type="button" size="sm" variant="ghost" disabled={isApplying}
              onClick={() => setSelectedIds(selectedIds.length === operations.length ? [] : allOperationIds)}>
              {selectedIds.length === operations.length ? "取消全选" : "全选"}
            </Button>
          </div>}
          <ul className="divide-y divide-border/60">
            {operations.map(operation => {
              const fields = Object.keys(operation.fields ?? {});
              const ownMissing = missingDependencies.find(result => result.operationId === operation.operationId);
              return (
                <li key={operation.operationId} className="space-y-3 py-4">
                  <label className="flex cursor-pointer items-start gap-2">
                    {!readOnly && <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-primary"
                      disabled={isApplying}
                      checked={selected.has(operation.operationId)}
                      onChange={() => toggleOperation(operation.operationId)}
                    />}
                    <span className="text-sm font-medium">{operationTitle(operation, document)}</span>
                    {readOnly && appliedIds && <span className="text-xs text-muted-foreground">{appliedIds.includes(operation.operationId) ? "已采纳" : "未采纳"}</span>}
                  </label>
                  {operation.kind === "update_fields" && fields.length > 1 && <p className="text-xs text-muted-foreground">
                    {fields.map(field => outlineFieldLabels[field] ?? field).join("、")}共 {fields.length} 处，组成一项修改。
                  </p>}
                  {operation.dependsOn.length ? (
                    <p className="text-xs text-muted-foreground">
                      前置依赖：{operation.dependsOn.map(dependencyName).join("、")}
                    </p>
                  ) : null}
                  {!readOnly && ownMissing ? (
                    <p role="alert" className="text-xs text-destructive">
                      还需同时勾选：{ownMissing.dependencyIds.map(dependencyName).join("、")}
                    </p>
                  ) : null}
                  <FieldChanges operation={operation} document={document} titles={titles} version={stale ? currentVersion : proposal.baseVersion} current={stale ? currentDocument : undefined} oldVersion={proposal.baseVersion} historical={!stale && proposal.baseVersion !== currentVersion} />
                  <p className="text-xs text-muted-foreground">建议理由：{displayText(operation.reason)}</p>
                  {operation.affectedNodeIds.length ? (
                    <p className="text-xs text-muted-foreground">影响范围：{operation.affectedNodeIds.map(id => titles[id] ?? findOutlineNodeTitle(document, id)).join("、")}</p>
                  ) : null}
                  {operation.risks.length ? <p className="text-xs text-amber-700 dark:text-amber-400">需要注意：{displayText(operation.risks.join("；"))}</p> : null}
                </li>
              );
            })}
          </ul>
          {!readOnly && operations.length > 0 && !selectedIds.length ? <p role="alert" className="text-xs text-destructive">至少选择一项操作后才能部分采纳。</p> : null}
          {!readOnly && missingDependencies.length ? <p role="alert" className="text-xs text-destructive">请一起勾选上面标出的关联修改。</p> : null}
          {allMissingDependencies.length ? <p role="alert" className="text-xs text-destructive">提案包含未知的依赖操作，请放弃后重新生成建议。</p> : null}
        </>
      ) : <InitialDraftReading payload={payload} />}

      {renderContext?.(document)}
      {!readOnly && <div className="outline-reading-actions">
        {"operations" in payload ? operations.length > 0 && (
          <Button onClick={() => onApply(selectedIds)} disabled={isApplying || applyDisabled || !selectedIsComplete}>
            {isApplying ? "正在处理…" : personFields ? `采纳${personName}这 ${personFields} 处修改` : `采纳所选（${selectedIds.length}）`}
          </Button>
        ) : (
          <Button onClick={() => onApply([])} disabled={isApplying || applyDisabled}>{replacesOutline ? "确认用此初稿替换整份大纲" : "采用这份初稿"}</Button>
        )}
        <Button variant="ghost" onClick={onLater} disabled={isApplying}>暂时搁置</Button>
      </div>}
    </section>
  );
}
