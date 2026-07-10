import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

export const ragContextualChunkOutputSchema = z.object({
  contextPrefix: z.string().min(0).max(260),
});

export interface RagContextualChunkPromptInput {
  ownerType: string;
  ownerId: string;
  title: string;
  novelId: string;
  worldId: string;
  chunkOrder: number;
  metadataJson: string;
  chunkText: string;
}

export const ragContextualChunkPrompt: PromptAsset<
  RagContextualChunkPromptInput,
  z.infer<typeof ragContextualChunkOutputSchema>
> = {
  id: "rag.contextual_chunk.prefix",
  version: "v1",
  taskType: "fact_extraction",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  structuredOutputHint: {
    example: {
      contextPrefix: "这段内容来自《示例小说》的角色设定，说明主角程秩持有后门铜钥匙，并限制它只能解释后门通行。",
    },
    note: "只返回一个 JSON 对象。contextPrefix 用 1-3 句中文概括该 chunk 在小说、章节、角色或知识文档中的定位。",
  },
  outputSchema: ragContextualChunkOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇小说 RAG 检索索引的上下文标注器。",
      "你的任务是为单个文本分块生成短上下文前缀，帮助检索系统理解该分块属于哪本小说、哪类资料、哪个章节或角色，以及它对连续性检索的用途。",
      "",
      "硬性要求：",
      "1. 只输出一个合法 JSON 对象，不要输出 Markdown、解释或代码块。",
      "2. contextPrefix 必须是 1-3 句简体中文，最多 260 字。",
      "3. 只能基于输入的标题、owner、metadata 和 chunk 正文归纳，不得添加输入中没有的剧情事实。",
      "4. 优先写出对检索有帮助的定位信息：小说/世界/章节/角色/知识文档标题、事实类型、时间或章节锚点。",
      "5. 不要复述整段正文；只补足分块脱离上下文后会缺失的检索线索。",
    ].join("\n")),
    new HumanMessage([
      `ownerType: ${input.ownerType}`,
      `ownerId: ${input.ownerId}`,
      `title: ${input.title || "未命名"}`,
      `novelId: ${input.novelId || "无"}`,
      `worldId: ${input.worldId || "无"}`,
      `chunkOrder: ${input.chunkOrder}`,
      "",
      "metadataJson:",
      input.metadataJson || "{}",
      "",
      "chunkText:",
      input.chunkText,
    ].join("\n")),
  ],
  postValidate: (output) => ({
    contextPrefix: output.contextPrefix.trim().slice(0, 260),
  }),
};
