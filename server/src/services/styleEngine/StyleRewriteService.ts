import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getLLM } from "../../llm/factory";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";
import { toLlmText } from "./helpers";

interface RewriteInput {
  content: string;
  styleProfileId?: string;
  novelId?: string;
  chapterId?: string;
  taskStyleProfileId?: string;
  issues: Array<{
    ruleName: string;
    excerpt: string;
    suggestion: string;
  }>;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export class StyleRewriteService {
  private readonly resolver = new StyleRuntimeResolver();

  async rewrite(input: RewriteInput): Promise<{ content: string }> {
    const resolved = await this.resolver.resolve({
      styleProfileId: input.styleProfileId,
      novelId: input.novelId,
      chapterId: input.chapterId,
      taskStyleProfileId: input.taskStyleProfileId,
    });

    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: input.temperature ?? 0.5,
    });
    const issuesBlock = input.issues.map((issue, index) => (
      `${index + 1}. ${issue.ruleName}\n片段：${issue.excerpt}\n修正建议：${issue.suggestion}`
    )).join("\n\n");

    const result = await llm.invoke([
      new SystemMessage([
        "你是小说修文编辑。",
        "请根据违规问题修正原文，只改违规表达，不改变事件事实、事件顺序和人物关系。",
        resolved.context.compiledBlocks?.style ?? "",
        resolved.context.compiledBlocks?.character ?? "",
        resolved.context.compiledBlocks?.antiAi ?? "",
        "输出要求：只输出修正后的正文，不解释修改过程。",
      ].filter(Boolean).join("\n\n")),
      new HumanMessage(`原文：
${input.content}

检测到的问题：
${issuesBlock}`),
    ]);

    return {
      content: toLlmText(result.content).trim(),
    };
  }
}
