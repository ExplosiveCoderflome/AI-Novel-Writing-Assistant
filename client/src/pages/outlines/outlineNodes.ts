import type { OutlineDocument } from "@ai-novel/shared/types/outline";

export type OutlineNode = OutlineDocument["story"]
  | OutlineDocument["volumes"][number]
  | OutlineDocument["chapters"][number]
  | OutlineDocument["characters"][number]
  | OutlineDocument["payoffs"][number]
  | OutlineDocument["facts"][number];

export const outlineFieldLabels: Record<string, string> = {
  title: "标题",
  name: "姓名",
  premise: "故事想法",
  synopsis: "故事梗概",
  theme: "主题",
  tone: "基调",
  endingDirection: "结局方向",
  targetAudience: "目标读者",
  genre: "题材",
  notes: "创作备注",
  summary: "概要",
  promise: "核心承诺",
  pressure: "主要压力",
  protagonistChange: "主角变化",
  climax: "高潮",
  endingHook: "结尾钩子",
  purpose: "章节目的",
  conflict: "主要冲突",
  emotionalBeat: "情绪与信息推进",
  role: "身份与故事作用",
  goal: "目标",
  motivation: "动机",
  secret: "秘密",
  arcDirection: "人物变化方向",
  content: "内容",
  kind: "类型",
  setupDescription: "埋设说明",
  payoffDescription: "回收说明",
  category: "类别",
  scope: "适用范围",
  immutable: "不可违背",
  planningDepth: "规划深度",
  volumeNodeId: "所属卷",
  parent: "父级节点",
  order: "排列顺序",
  chapterNodeIds: "包含章节",
  chapterRefs: "章节引用",
  characterNodeIds: "关联人物",
  payoffNodeIds: "关联伏笔",
  appearanceNodeIds: "计划出场位置",
  setupChapterNodeIds: "计划埋设章节",
  payoffChapterNodeIds: "计划回收章节",
  relatedNodeIds: "关联节点",
};

export function getOutlineNodes(document: OutlineDocument): OutlineNode[] {
  return [
    document.story,
    ...document.volumes,
    ...document.chapters,
    ...document.characters,
    ...document.payoffs,
    ...document.facts,
  ];
}

export function getOutlineNodeTitle(node: OutlineNode | null | undefined): string {
  if (!node) return "未命名节点";
  return ("title" in node ? node.title : node.name) || "未命名节点";
}

export function findOutlineNode(document: OutlineDocument, nodeId: string): OutlineNode | undefined {
  return getOutlineNodes(document).find(node => node.nodeId === nodeId);
}

export function findOutlineNodeTitle(document: OutlineDocument, nodeId: string): string {
  const node = findOutlineNode(document, nodeId);
  return node ? getOutlineNodeTitle(node) : "（已删除的节点）";
}

/** Resolve references against the version being displayed, never the current draft. */
export function formatOutlineValue(value: unknown, field = "", document?: OutlineDocument, titles: Record<string, string> = {}): string {
  if (value === undefined || value === null || value === "") return "无";
  if (Array.isArray(value)) {
    if (!value.length) return "无";
    return value.map(item => formatOutlineValue(item, field, document, titles)).join("、");
  }
  if (typeof value === "string") {
    if (/NodeIds?$/.test(field)) return titles[value] ?? (document ? findOutlineNodeTitle(document, value) : "（已删除的节点）");
    const labels: Record<string, string> = { rough: "粗纲", detailed: "细纲", story: "全书", volume: "卷", chapter: "章节", character: "人物", payoff: "伏笔", fact: "固定设定", other: "其他", hook: "钩子", foreshadowing: "伏笔", promise: "承诺", mystery: "悬念" };
    return ["planningDepth", "kind", "category", "type"].includes(field) ? labels[value] ?? value : value;
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${outlineFieldLabels[key] ?? (key === "type" ? "类型" : key === "nodeId" ? "节点" : key)}：${formatOutlineValue(item, key === "nodeId" ? "relatedNodeIds" : key, document, titles)}`).join("；");
  return String(value);
}

/** Only known schema terms / proposal IDs are translated; prose stays untouched. */
export function localizeOutlineText(text: string, operationTitles: Record<string, string> = {}): string {
  let result = text.replace(/\bimmutable\s*=\s*(true|false)\b/g, (_, value: string) => value === "true" ? "不可违背的设定" : "可调整的设定");
  for (const [id, title] of Object.entries(operationTitles).sort((a, b) => b[0].length - a[0].length)) {
    result = result.replaceAll(id, title);
  }
  return result.replace(/\b[A-Za-z][A-Za-z0-9]*\b/g, word => outlineFieldLabels[word] ?? word)
    .replace(/\bop-[A-Za-z0-9_-]+\b/g, "相关修改");
}
