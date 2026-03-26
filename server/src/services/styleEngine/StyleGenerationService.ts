import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { CompiledStylePromptBlocks } from "@ai-novel/shared/types/styleEngine";
import { runTextPrompt } from "../../prompting/core/promptRunner";
import { styleGenerationPrompt } from "../../prompting/prompts/style/style.prompts";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";

interface TestWriteInput {
  styleProfileId: string;
  mode: "generate" | "rewrite";
  topic?: string;
  sourceText?: string;
  targetLength?: number;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export class StyleGenerationService {
  private readonly resolver = new StyleRuntimeResolver();

  async testWrite(input: TestWriteInput): Promise<{
    output: string;
    compiledBlocks: CompiledStylePromptBlocks;
  }> {
    const resolved = await this.resolver.resolve({ styleProfileId: input.styleProfileId });
    if (!resolved.context.compiledBlocks) {
      throw new Error("该写法没有可执行规则。");
    }

    const targetLength = input.targetLength ?? 1200;
    const prompt = input.mode === "rewrite"
      ? `任务：请在不改变事件事实与顺序的前提下改写原文，使其符合当前写法。

原文：
${input.sourceText ?? ""}`
      : `任务：请围绕以下主题创作一段小说文本，控制在 ${targetLength} 字左右。

主题：
${input.topic ?? ""}`;

    const result = await runTextPrompt({
      asset: styleGenerationPrompt,
      promptInput: {
        styleBlock: resolved.context.compiledBlocks.style,
        characterBlock: resolved.context.compiledBlocks.character,
        antiAiBlock: resolved.context.compiledBlocks.antiAi,
        selfCheckBlock: resolved.context.compiledBlocks.selfCheck,
        mode: input.mode,
        prompt,
        targetLength,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.7,
      },
    });

    return {
      output: result.output.trim(),
      compiledBlocks: resolved.context.compiledBlocks,
    };
  }
}
