import type { BaseMessageChunk } from "@langchain/core/messages";

function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }
  if (content && typeof content === "object" && "text" in content && typeof (content as { text?: unknown }).text === "string") {
    return (content as { text: string }).text;
  }
  return "";
}

export function extractJsonArray(raw: string): string {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const first = cleaned.indexOf("[");
  const last = cleaned.lastIndexOf("]");
  if (first < 0 || last <= first) {
    throw new Error("LLM 未返回合法的 JSON 数组。");
  }
  return cleaned.slice(first, last + 1);
}

export async function collectStream(stream: AsyncIterable<BaseMessageChunk>): Promise<string> {
  let fullContent = "";
  for await (const chunk of stream) {
    fullContent += toText(chunk.content);
  }
  return fullContent.trim();
}

export function parseStructuredOutline(raw: string): Array<{ order: number; title: string; summary: string }> {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("结构化大纲不是数组。");
  }
  return parsed
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const order = typeof record.chapter === "number"
        ? record.chapter
        : typeof record.chapter === "string"
          ? Number(record.chapter)
          : null;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const summary = typeof record.summary === "string" ? record.summary.trim() : "";
      if (!order || !title) {
        return null;
      }
      return { order, title, summary };
    })
    .filter((item): item is { order: number; title: string; summary: string } => Boolean(item))
    .sort((left, right) => left.order - right.order);
}
