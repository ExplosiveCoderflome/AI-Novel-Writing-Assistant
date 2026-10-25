import type { StyleProfileExtractionPromptInput } from "../../../prompting/prompts/style/style.prompts";
import type { styleProfileExtractionSchema } from "../../../prompting/prompts/style/style.promptSchemas";
import type { z } from "zod";
type Extraction = z.infer<typeof styleProfileExtractionSchema>;

export function splitExtractionSource(source: string, size = 24000): string[] {
  if (!Number.isInteger(size) || size < 2) throw new Error("来源分段参数无效。");
  const result: string[] = [];
  for (let start = 0; start < source.length;) {
    let end = Math.min(source.length, start + size);
    if (end < source.length && /[\uD800-\uDBFF]/.test(source[end - 1])) end -= 1;
    result.push(source.slice(start, end)); start = end;
  }
  return result.length ? result : [source];
}

export async function extractSourceSegments(input: StyleProfileExtractionPromptInput, generate: (part: StyleProfileExtractionPromptInput) => Promise<Extraction>, segmentSize = 24000): Promise<Extraction> {
  const parts = splitExtractionSource(input.sourceText, segmentSize);
  if (parts.length > 128) throw new Error("来源超过分段处理上限，请按卷拆分来源后提取。");
  if (parts.length === 1) return generate(input);
  const outputs: Extraction[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    outputs.push(await generate({ ...input, sourceText: parts[i], segment: { index: i + 1, count: parts.length } }));
  }
  return {
    name: input.name,
    description: outputs.map((o, i) => `片段 ${i + 1}：${o.description ?? o.summary ?? ""}`).join("\n"),
    summary: outputs.map((o, i) => `片段 ${i + 1}：${o.summary ?? ""}`).join("\n"),
    analysisMarkdown: outputs.map((o, i) => `### 片段 ${i + 1}\n${o.analysisMarkdown ?? ""}`).join("\n\n"),
    features: outputs.flatMap((o, i) => (o.features ?? []).map((f) => ({ ...f, id: `segment-${i + 1}-${f.id}` }))),
  };
}
