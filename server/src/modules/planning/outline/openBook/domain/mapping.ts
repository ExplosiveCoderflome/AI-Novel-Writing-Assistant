import { createHash } from "node:crypto";
import { validateOutlineDocument, type OutlineDocument } from "@ai-novel/shared/types/outline";
import { outlineOpenBookInputSchema, type OutlineBookMapping, type OutlineBookPolicy, type OutlineOpenBookInput } from "@ai-novel/shared/types/outlineOpenBook";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const outlineHash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const fail = (message: string): never => { throw new Error(`OUTLINE_OPEN_INVALID: ${message}`); };

export function validateOpenBookDocument(value: unknown): OutlineDocument {
  const doc = validateOutlineDocument(value);
  const types = new Map<string, string>([[doc.story.nodeId, "story"], ...(["volumes", "chapters", "characters", "payoffs", "facts"] as const).flatMap(group => doc[group].map(n => [n.nodeId, group] as [string, string]))]);
  const ref = (owner: string, field: string, id: string, allowed: string[]) => {
    if (!allowed.includes(types.get(id) ?? "")) fail(`${owner}.${field} 引用类型错误：${id}`);
  };
  const uniqueOrder = (nodes: Array<{ order: number; nodeId: string }>, label: string) => {
    if (new Set(nodes.map(n => n.order)).size !== nodes.length) fail(`${label}排序重复`);
    if (nodes.some(n => n.order < 0)) fail(`${label}排序不能为负数`);
  };
  uniqueOrder(doc.volumes, "卷");
  for (const v of doc.volumes) {
    if (new Set(v.chapterNodeIds).size !== v.chapterNodeIds.length) fail(`${v.nodeId}.chapterNodeIds 重复`);
    v.chapterNodeIds.forEach(id => ref(v.nodeId, "chapterNodeIds", id, ["chapters"]));
    const chapters = doc.chapters.filter(c => c.volumeNodeId === v.nodeId);
    uniqueOrder(chapters, v.nodeId);
    if (chapters.length !== v.chapterNodeIds.length || chapters.some(c => !v.chapterNodeIds.includes(c.nodeId))) fail(`${v.nodeId} 卷章双向引用不一致`);
    const declared = v.chapterNodeIds;
    if (chapters.sort((a, b) => a.order - b.order).some((c, i) => declared[i] !== c.nodeId)) fail(`${v.nodeId} 章节引用次序与 order 矛盾`);
  }
  for (const c of doc.chapters) {
    ref(c.nodeId, "volumeNodeId", c.volumeNodeId, ["volumes"]);
    c.characterNodeIds.forEach(id => ref(c.nodeId, "characterNodeIds", id, ["characters"]));
    c.payoffNodeIds.forEach(id => ref(c.nodeId, "payoffNodeIds", id, ["payoffs"]));
  }
  for (const c of doc.characters) c.appearanceNodeIds.forEach(id => ref(c.nodeId, "appearanceNodeIds", id, ["volumes", "chapters"]));
  for (const p of doc.payoffs) [...p.setupChapterNodeIds, ...p.payoffChapterNodeIds].forEach(id => ref(p.nodeId, "chapterRefs", id, ["chapters"]));
  for (const f of doc.facts) {
    if (f.scope.type !== "story" && !f.scope.nodeId) fail(`${f.nodeId}.scope 缺少目标`);
    if (f.scope.nodeId) ref(f.nodeId, "scope", f.scope.nodeId, [f.scope.type === "story" ? "story" : f.scope.type === "volume" ? "volumes" : "chapters"]);
  }
  if (!(doc.story.premise.trim() || doc.story.synopsis.trim())) fail("故事想法不能为空");
  return doc;
}

export function mapOutlineBook(value: unknown, raw: OutlineOpenBookInput, bindingId: string) {
  const doc = validateOpenBookDocument(value);
  const input = outlineOpenBookInputSchema.parse(raw);
  const volumes = [...doc.volumes].sort((a, b) => a.order - b.order);
  const counts = volumes.map(v => doc.chapters.filter(c => c.volumeNodeId === v.nodeId).length);
  const quotas = volumes.map((v, i) => input.volumeQuotas[v.nodeId] ?? Math.max(1, counts[i]));
  for (const key of Object.keys(input.volumeQuotas)) if (!volumes.some(v => v.nodeId === key)) fail(`篇幅分配包含未知卷：${key}`);
  if (quotas.some((q, i) => q < counts[i])) fail("卷章数预算不能少于已有章纲");
  const total = input.bookSettings.estimatedChapterCount;
  let remaining = total - quotas.reduce((a, b) => a + b, 0);
  if (remaining < 0) fail("目标章数不足以容纳卷预算");
  const flexible = volumes.map((v, i) => !input.volumeQuotas[v.nodeId] && (v.planningDepth === "rough" || counts[i] === 0) ? i : -1).filter(i => i >= 0);
  if (remaining && volumes.length) {
    if (!flexible.length) fail("请明确卷篇幅分配，使卷章数之和等于目标章数");
    flexible.forEach((i, n) => { const extra = Math.floor(remaining / (flexible.length - n)); quotas[i] += extra; remaining -= extra; });
  }
  const stableId = (kind: string, id: string) => `${kind}_${outlineHash([bindingId, kind, id]).slice(0, 32)}`;
  let order = 1;
  const mapping: OutlineBookMapping = { volumes: [], chapters: [], characters: [], payoffs: [] };
  volumes.forEach((v, i) => {
    const volumeId = stableId("vol", v.nodeId);
    mapping.volumes.push({ nodeId: v.nodeId, volumeId, chapterQuota: quotas[i], from: order, to: order + quotas[i] - 1 });
    doc.chapters.filter(c => c.volumeNodeId === v.nodeId).sort((a, b) => a.order - b.order).forEach((c, n) => mapping.chapters.push({ nodeId: c.nodeId, volumeId, planId: stableId("plan", c.nodeId), chapterId: stableId("ch", c.nodeId), chapterOrder: order + n }));
    order += quotas[i];
  });
  mapping.characters = doc.characters.map(c => ({ nodeId: c.nodeId, characterId: stableId("char", c.nodeId) }));
  mapping.payoffs = doc.payoffs.map(p => ({ nodeId: p.nodeId, ledgerKey: `outline:${bindingId}:${p.nodeId}`, ledgerItemId: null }));
  const policy: OutlineBookPolicy = { rules: [] };
  const identity = new Set(["nodeId", "order", "volumeNodeId", "chapterNodeIds", "immutable"]);
  for (const node of [doc.story, ...doc.volumes, ...doc.chapters, ...doc.characters, ...doc.payoffs, ...doc.facts]) {
    for (const [field, value] of Object.entries(node)) {
      if (identity.has(field)) continue;
      const hard = "immutable" in node && node.immutable && ["content", "scope"].includes(field);
      const optimize = input.allowOptimize.some(r => r.nodeId === node.nodeId && r.field === field);
      const empty = value == null || value === "" || Array.isArray(value) && value.length === 0;
      policy.rules.push({ nodeId: node.nodeId, field, value, mode: hard ? "hard_constraint" : empty ? "fill_missing" : optimize ? "propose_change" : "preserve" });
    }
  }
  for (const choice of input.allowOptimize) {
    const rule = policy.rules.find(r => r.nodeId === choice.nodeId && r.field === choice.field);
    if (!rule || rule.mode === "hard_constraint") fail(`不能放开固定设定或身份字段：${choice.nodeId}.${choice.field}`);
  }
  const sourceDocumentHash = outlineHash(doc);
  const requestHash = outlineHash({ sourceDocumentHash, input });
  return { document: doc, mapping, policy, sourceDocumentHash, requestHash, settings: input.bookSettings, warnings: doc.characters.filter((c, i) => doc.characters.findIndex(x => x.name === c.name) !== i).map(c => `同名人物分别保留：${c.name}`) };
}
