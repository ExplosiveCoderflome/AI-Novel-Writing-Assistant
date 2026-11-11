import { useMemo, useState } from "react";
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
import {
  findOutlineNode,
  findOutlineNodeTitle,
  formatOutlineValue,
  outlineFieldLabels,
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

const initialGroupLabels = {
  volumes: "卷",
  chapters: "章节",
  characters: "人物",
  payoffs: "伏笔与钩子",
  facts: "固定设定",
} as const;

interface OutlineProposalPanelProps {
  proposal: OutlineProposal;
  document: OutlineDocument;
  isApplying: boolean;
  onApply: (operationIds: string[]) => void;
  onDiscard: () => void;
}

function operationTitle(operation: OutlineProposalOperation, document: OutlineDocument): string {
  const targetTitle = operation.nodeId ? findOutlineNodeTitle(document, operation.nodeId) : "";
  if (operation.kind === "add_node") {
    const title = operation.fields?.title ?? operation.fields?.name ?? operation.clientRef ?? "新节点";
    return `新增${operation.nodeType ? nodeTypeLabels[operation.nodeType] : "节点"}「${String(title)}」`;
  }
  return `${operationKindLabels[operation.kind]}「${targetTitle || operation.nodeId || operation.clientRef || "节点"}」`;
}

function FieldChanges({ operation, document }: { operation: OutlineProposalOperation; document: OutlineDocument }) {
  const target = operation.nodeId ? findOutlineNode(document, operation.nodeId) : undefined;
  const targetRecord = target as unknown as Record<string, unknown> | undefined;
  if (operation.kind === "move_node") {
    return (
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">原所属卷</dt><dd className="mt-1 whitespace-pre-wrap">{targetRecord?.volumeNodeId ? findOutlineNodeTitle(document, String(targetRecord.volumeNodeId)) : "（空）"}</dd></div>
        <div><dt className="text-muted-foreground">调整后所属卷</dt><dd className="mt-1 whitespace-pre-wrap">{operation.parentNodeId ? findOutlineNodeTitle(document, operation.parentNodeId) : "（空）"}</dd></div>
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
          <dl className="mt-1 grid gap-2 sm:grid-cols-2">
            <div className="bg-muted/40 p-2"><dt className="text-muted-foreground">调整前</dt><dd className="mt-1 whitespace-pre-wrap break-words">{formatOutlineValue(targetRecord?.[field])}</dd></div>
            <div className="bg-muted/40 p-2"><dt className="text-muted-foreground">调整后</dt><dd className="mt-1 whitespace-pre-wrap break-words">{formatOutlineValue(after)}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
}

function InitialProposalPreview({ payload }: { payload: OutlineInitialProposalPayload }) {
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h4 className="font-medium">{payload.storyFields.title}</h4>
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{payload.storyFields.synopsis || payload.storyFields.premise}</p>
      </section>
      {(Object.keys(initialGroupLabels) as Array<keyof typeof initialGroupLabels>).map(group => (
        <section key={group}>
          <h4 className="text-xs font-medium text-muted-foreground">{initialGroupLabels[group]} · {payload[group].length}</h4>
          <ul className="mt-2 space-y-2">
            {payload[group].map(item => (
              <li key={item.clientRef}>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{item.summary}</p>
                {item.reason ? <p className="mt-1 text-xs text-muted-foreground">建议理由：{item.reason}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function OutlineProposalPanel({ proposal, document, isApplying, onApply, onDiscard }: OutlineProposalPanelProps) {
  const payload = useMemo(
    () => JSON.parse(proposal.proposalJson) as OutlineInitialProposalPayload | { operations: OutlineProposalOperation[] },
    [proposal.proposalJson],
  );
  const operations = "operations" in payload ? payload.operations : [];
  const allOperationIds = useMemo(() => operations.map(operation => operation.operationId), [operations]);
  const [selectedIds, setSelectedIds] = useState<string[]>(allOperationIds);
  const selected = new Set(selectedIds);
  const missingDependencies = findMissingOperationDependencies(operations, selectedIds);
  const allMissingDependencies = findMissingOperationDependencies(operations, allOperationIds);
  const selectedIsComplete = canApplyOperationSelection(operations, selectedIds);

  const toggleOperation = (operationId: string) => {
    setSelectedIds(current => current.includes(operationId)
      ? current.filter(id => id !== operationId)
      : [...current, operationId]);
  };

  const dependencyName = (operationId: string) => {
    const dependency = operations.find(operation => operation.operationId === operationId);
    return dependency ? operationTitle(dependency, document) : operationId;
  };

  return (
    <section className="space-y-4 border-t border-border/50 pt-4">
      <div>
        <h3 className="font-medium">待确认的建议</h3>
        <p className="mt-1 text-xs text-muted-foreground">基于修订 v{proposal.baseVersion}。勾选需要的操作，依赖项必须一起采纳。</p>
      </div>

      {"operations" in payload ? (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">已选择 {selectedIds.length} / {operations.length} 项</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(allOperationIds)}>全选</Button>
          </div>
          <ul className="space-y-3">
            {operations.map(operation => {
              const ownMissing = missingDependencies.find(result => result.operationId === operation.operationId);
              return (
                <li key={operation.operationId} className="space-y-3 bg-muted/25 p-3">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-primary"
                      checked={selected.has(operation.operationId)}
                      onChange={() => toggleOperation(operation.operationId)}
                    />
                    <span className="text-sm font-medium">{operationTitle(operation, document)}</span>
                  </label>
                  <p className="text-xs text-muted-foreground">建议理由：{operation.reason}</p>
                  {operation.dependsOn.length ? (
                    <p className="text-xs text-muted-foreground">
                      前置依赖：{operation.dependsOn.map(dependencyName).join("、")}
                    </p>
                  ) : null}
                  {ownMissing ? (
                    <p role="alert" className="text-xs text-destructive">
                      还需同时勾选：{ownMissing.dependencyIds.map(dependencyName).join("、")}
                    </p>
                  ) : null}
                  <FieldChanges operation={operation} document={document} />
                  {operation.affectedNodeIds.length ? (
                    <p className="text-xs text-muted-foreground">影响范围：{operation.affectedNodeIds.map(id => findOutlineNodeTitle(document, id)).join("、")}</p>
                  ) : null}
                  {operation.risks.length ? <p className="text-xs text-amber-700 dark:text-amber-400">需要注意：{operation.risks.join("；")}</p> : null}
                </li>
              );
            })}
          </ul>
          {!selectedIds.length ? <p role="alert" className="text-xs text-destructive">至少选择一项操作后才能部分采纳。</p> : null}
          {missingDependencies.length ? <p role="alert" className="text-xs text-destructive">当前组合缺少前置操作，请按提示补齐，或改为采纳全部。</p> : null}
          {allMissingDependencies.length ? <p role="alert" className="text-xs text-destructive">提案包含未知的依赖操作，请放弃后重新生成建议。</p> : null}
        </>
      ) : <InitialProposalPreview payload={payload} />}

      <div className="space-y-2">
        {"operations" in payload ? (
          <Button className="w-full" onClick={() => onApply(allOperationIds)} disabled={isApplying || allMissingDependencies.length > 0}>
            采纳全部
          </Button>
        ) : (
          <Button className="w-full" onClick={() => onApply([])} disabled={isApplying}>采纳这份大纲</Button>
        )}
        {"operations" in payload ? (
          <Button className="w-full" variant="secondary" onClick={() => onApply(selectedIds)} disabled={isApplying || !selectedIsComplete}>
            采纳所选（{selectedIds.length}）
          </Button>
        ) : null}
        <Button className="w-full" variant="ghost" onClick={onDiscard} disabled={isApplying}>放弃</Button>
      </div>
    </section>
  );
}
