import { outlineDocumentSchema } from "./outlineDocument";
import { AppError } from "../../../../middleware/errorHandler";

export type OutlineEditOperation = {
  operationId: string;
  kind: string;
  nodeType?: string;
  nodeId?: string;
  clientRef?: string;
  parentNodeId?: string;
  fields?: Record<string, unknown>;
  dependsOn: string[];
  reason?: string;
  affectedNodeIds?: string[];
  risks?: string[];
};

export type OutlineEditDocumentView = {
  story?: { nodeId: string };
  volumes: Array<{ nodeId: string }>;
  chapters: Array<{ nodeId: string; volumeNodeId: string }>;
  characters?: Array<{ nodeId: string }>;
  payoffs?: Array<{ nodeId: string }>;
  facts?: Array<{ nodeId: string }>;
};

const storyChanges = outlineDocumentSchema.shape.story.omit({ nodeId: true }).partial().strict();

function recoverable(message: string, details?: unknown): AppError {
  return new AppError(message, 400, details);
}

function assertUniqueOperationIds(operations: OutlineEditOperation[]): void {
  const seen = new Set<string>();
  for (const operation of operations) {
    if (!operation.operationId?.trim()) {
      throw recoverable("提案操作缺少有效的操作编号，请重新生成提案。");
    }
    if (seen.has(operation.operationId)) {
      throw recoverable(`提案中存在重复的操作编号「${operation.operationId}」，请重新生成提案。`);
    }
    seen.add(operation.operationId);
  }
}

function assertDependsOnAreOperationIds(operations: OutlineEditOperation[]): void {
  const operationIds = new Set(operations.map((operation) => operation.operationId));
  for (const operation of operations) {
    for (const dependencyId of operation.dependsOn ?? []) {
      if (!operationIds.has(dependencyId)) {
        throw recoverable(
          `操作「${operation.operationId}」的依赖必须是同一提案里的其他操作编号，不能填写卷/章节等节点编号。请重新生成提案。`,
          { operationId: operation.operationId, dependencyId },
        );
      }
      if (dependencyId === operation.operationId) {
        throw recoverable(`操作「${operation.operationId}」不能依赖自己，请重新生成提案。`);
      }
    }
  }
}

function assertNoDependencyCycles(operations: OutlineEditOperation[]): void {
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (operationId: string, stack: string[]) => {
    if (visited.has(operationId)) return;
    if (visiting.has(operationId)) {
      throw recoverable(`提案操作依赖形成循环（${[...stack, operationId].join(" → ")}），请重新生成提案。`);
    }
    visiting.add(operationId);
    for (const dependencyId of byId.get(operationId)?.dependsOn ?? []) {
      visit(dependencyId, [...stack, operationId]);
    }
    visiting.delete(operationId);
    visited.add(operationId);
  };
  for (const operation of operations) visit(operation.operationId, []);
}

function volumeRefsInProposal(operations: OutlineEditOperation[]): Set<string> {
  const refs = new Set<string>();
  for (const operation of operations) {
    if (operation.kind === "add_node" && operation.nodeType === "volume" && operation.clientRef?.trim()) {
      refs.add(operation.clientRef.trim());
    }
  }
  return refs;
}

function existingNodeIds(document: OutlineEditDocumentView | undefined): Set<string> {
  const ids = new Set<string>();
  if (!document) return ids;
  for (const volume of document.volumes) ids.add(volume.nodeId);
  for (const chapter of document.chapters) ids.add(chapter.nodeId);
  for (const character of document.characters ?? []) ids.add(character.nodeId);
  for (const payoff of document.payoffs ?? []) ids.add(payoff.nodeId);
  for (const fact of document.facts ?? []) ids.add(fact.nodeId);
  return ids;
}

function existingVolumeIds(document: OutlineEditDocumentView | undefined): Set<string> {
  return new Set((document?.volumes ?? []).map((volume) => volume.nodeId));
}

/** Structural checks after AI generation and again before apply. Never silently drops deps or invents volume ownership. */
export function assertValidOutlineEditOperations(
  operations: OutlineEditOperation[],
  options: { document?: OutlineEditDocumentView; selectedOperationIds?: string[] } = {},
): void {
  if (!Array.isArray(operations) || operations.length < 1) {
    throw recoverable("提案中没有可采纳的操作，请重新生成提案。");
  }
  assertUniqueOperationIds(operations);
  assertDependsOnAreOperationIds(operations);
  assertNoDependencyCycles(operations);

  const selected = new Set(
    options.selectedOperationIds?.length
      ? options.selectedOperationIds
      : operations.map((operation) => operation.operationId),
  );
  if (selected.size < 1) {
    throw recoverable("请至少选择一项操作后再采纳。");
  }
  for (const operationId of selected) {
    if (!operations.some((operation) => operation.operationId === operationId)) {
      throw recoverable(`所选操作「${operationId}」不在当前提案中。`);
    }
  }
  for (const operation of operations.filter((item) => selected.has(item.operationId))) {
    for (const dependencyId of operation.dependsOn ?? []) {
      if (!selected.has(dependencyId)) {
        throw recoverable(
          `所选操作「${operation.operationId}」还依赖未勾选的操作「${dependencyId}」。请一并勾选依赖项，或重新生成提案。`,
          { operationId: operation.operationId, dependencyId },
        );
      }
    }
  }

  const selectedOps = operations.filter((operation) => selected.has(operation.operationId));
  const volumeClientRefs = volumeRefsInProposal(selectedOps);
  const volumeIds = existingVolumeIds(options.document);
  const nodeIds = existingNodeIds(options.document);

  for (const operation of selectedOps) {
    if (operation.kind === "add_node" && operation.nodeType === "chapter") {
      const volumeNodeId = typeof operation.fields?.volumeNodeId === "string"
        ? operation.fields.volumeNodeId.trim()
        : "";
      if (!volumeNodeId) {
        throw recoverable(
          "新增章节必须指定所属卷（fields.volumeNodeId）。请不要只改卷的章节列表来表达新增章节，请重新生成提案。",
          { operationId: operation.operationId },
        );
      }
      if (!volumeIds.has(volumeNodeId) && !volumeClientRefs.has(volumeNodeId)) {
        throw recoverable(
          `新增章节的所属卷「${volumeNodeId}」不存在，也不是本次提案中新建卷的临时编号。请重新生成提案。`,
          { operationId: operation.operationId, volumeNodeId },
        );
      }
      if (!operation.clientRef?.trim()) {
        throw recoverable(`新增章节操作「${operation.operationId}」缺少临时编号 clientRef，请重新生成提案。`);
      }
    }

    if (operation.kind === "update_fields") {
      if (!operation.nodeId?.trim()) {
        throw recoverable(`更新操作「${operation.operationId}」缺少目标节点，请重新生成提案。`);
      }
      if (operation.nodeId === options.document?.story?.nodeId) {
        if (!operation.fields || !Object.keys(operation.fields).length || !storyChanges.safeParse(operation.fields).success) {
          throw recoverable("总纲提案含有无法编辑的字段，请重新生成建议。");
        }
      } else if (options.document && !nodeIds.has(operation.nodeId) && !volumeClientRefs.has(operation.nodeId)) {
        // allow update only on existing nodes at apply-time; generation may still emit updates for existing ids
        throw recoverable(`要更新的节点不存在，请刷新大纲后重新生成提案。`, { operationId: operation.operationId, nodeId: operation.nodeId });
      }
      if (operation.fields && Object.prototype.hasOwnProperty.call(operation.fields, "chapterNodeIds")) {
        throw recoverable(
          "不能通过直接修改卷的章节列表来新增或调整章节。请使用「新增章节」或「移动章节」操作，请重新生成提案。",
          { operationId: operation.operationId },
        );
      }
    }

    if (operation.kind === "remove_node" || operation.kind === "move_node") {
      if (!operation.nodeId?.trim()) {
        throw recoverable(`操作「${operation.operationId}」缺少目标节点，请重新生成提案。`);
      }
      if (options.document && !nodeIds.has(operation.nodeId)) {
        throw recoverable(`目标节点不存在，请刷新大纲后重新生成提案。`, { operationId: operation.operationId, nodeId: operation.nodeId });
      }
    }
    if (operation.kind === "move_node") {
      const parent = operation.parentNodeId?.trim() ?? "";
      if (!parent) {
        throw recoverable(`移动章节操作「${operation.operationId}」必须指定目标卷，请重新生成提案。`);
      }
      if (options.document && !volumeIds.has(parent) && !volumeClientRefs.has(parent)) {
        throw recoverable(`移动章节的目标卷不存在，请重新生成提案。`, { operationId: operation.operationId, parentNodeId: parent });
      }
    }
  }
}

export function mapOutlineApplyFailure(error: unknown): never {
  if (error instanceof AppError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  if (message === "所选操作缺少依赖项") {
    throw recoverable("所选操作还缺少依赖项。请勾选全部依赖的操作后再采纳，或重新生成提案。");
  }
  if (message === "提案目标节点不存在" || message === "当前仅支持移动章节") {
    throw recoverable("提案指向的节点已不存在或类型不匹配，请刷新大纲后重新生成提案。");
  }
  if (message.includes("大纲节点 ID 必须唯一") || message.includes("大纲引用不存在的节点")) {
    throw recoverable("采纳后的大纲引用不完整或节点编号冲突，请重新生成提案。");
  }
  if (message.startsWith("OUTLINE_")) {
    throw new AppError("大纲已更新，请重新生成提案。", 409);
  }
  throw error;
}
