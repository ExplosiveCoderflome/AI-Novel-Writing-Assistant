import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runTextPrompt } from "../../prompting/core/promptRunner";
import { styleRewritePrompt } from "../../prompting/prompts/style/style.prompts";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";

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

    const issuesBlock = input.issues.map((issue, index) => (
      `${index + 1}. ${issue.ruleName}\n片段：${issue.excerpt}\n修正建议：${issue.suggestion}`
    )).join("\n\n");

    const result = await runTextPrompt({
      asset: styleRewritePrompt,
      promptInput: {
        styleBlock: resolved.context.compiledBlocks?.style ?? "",
        characterBlock: resolved.context.compiledBlocks?.character ?? "",
        antiAiBlock: resolved.context.compiledBlocks?.antiAi ?? "",
        content: input.content,
        issuesBlock,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.5,
      },
    });

    return {
      content: result.output.trim(),
    };
  }
}
