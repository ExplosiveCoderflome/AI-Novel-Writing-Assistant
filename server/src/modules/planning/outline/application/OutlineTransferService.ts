import { validateOutlineDocument, type OutlineDocument } from "../domain/outlineDocument";

export function exportOutlineJson(title: string, version: number, document: OutlineDocument): string {
  return JSON.stringify({ format: "anw-outline", schemaVersion: 1, project: { title }, revision: { version }, document: validateOutlineDocument(document) }, null, 2);
}
export function importOutlineJson(input: string): { title: string; document: OutlineDocument } {
  const data = JSON.parse(input) as { format?: string; schemaVersion?: number; project?: { title?: string }; document?: unknown };
  if (data.format !== "anw-outline") throw new Error("文件格式不是 anw-outline JSON");
  if (data.schemaVersion !== 1) throw new Error("不支持此大纲 JSON 版本");
  if (!data.project?.title || !data.document) throw new Error("大纲 JSON 缺少项目标题或文档内容");
  return { title: data.project.title, document: validateOutlineDocument(data.document) };
}
export function exportOutlineMarkdown(document: OutlineDocument): string {
  const lines = [`# ${document.story.title}`, "", "## 故事总纲", document.story.synopsis || document.story.premise, "", `主题：${document.story.theme}`, `基调：${document.story.tone}`, `结局方向：${document.story.endingDirection}`, ""];
  for (const volume of [...document.volumes].sort((a,b)=>a.order-b.order)) {
    lines.push(`## ${volume.title} <!-- ${volume.nodeId} -->`, "", volume.summary, "");
    for (const chapter of document.chapters.filter(x=>x.volumeNodeId===volume.nodeId).sort((a,b)=>a.order-b.order)) lines.push(`### ${chapter.title} <!-- ${chapter.nodeId} -->`, "", chapter.summary, "");
  }
  for (const [heading, items] of [["人物草案", document.characters.map(x=>`- ${x.name} <!-- ${x.nodeId} -->${x.role ? `：${x.role}` : ""}`)], ["伏笔与钩子", document.payoffs.map(x=>`- ${x.title} <!-- ${x.nodeId} -->：${x.setupDescription} → ${x.payoffDescription}`)], ["固定设定", document.facts.map(x=>`- ${x.title} <!-- ${x.nodeId} -->：${x.content}`)]] as const) lines.push(`## ${heading}`, "", ...items, "");
  return lines.join("\n");
}
