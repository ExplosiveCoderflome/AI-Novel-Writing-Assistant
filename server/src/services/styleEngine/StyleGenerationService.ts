import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { CompiledStylePromptBlocks } from "@ai-novel/shared/types/styleEngine";
import { getLLM } from "../../llm/factory";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";
import { toLlmText } from "./helpers";

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

    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: input.temperature ?? 0.7,
    });

    const targetLength = input.targetLength ?? 1200;
    const prompt = input.mode === "rewrite"
      ? `任务：请在不改变事件事实与顺序的前提下改写原文，使其符合当前写法。

原文：
${input.sourceText ?? ""}`
      : `任务：请围绕以下主题创作一段小说文本，控制在 ${targetLength} 字左右。

主题：
${input.topic ?? ""}`;

    const result = await llm.invoke([
      new SystemMessage([
        "你是小说写作助手。请严格遵守以下写法约束。",
        resolved.context.compiledBlocks.style,
        resolved.context.compiledBlocks.character,
        resolved.context.compiledBlocks.antiAi,
        `输出要求：${input.mode === "rewrite" ? "直接输出改写后的正文，不解释修改原因。" : `直接输出正文，长度约 ${targetLength} 字。`}`,
        resolved.context.compiledBlocks.selfCheck,
      ].filter(Boolean).join("\n\n")),
      new HumanMessage(prompt),
    ]);

    return {
      output: toLlmText(result.content).trim(),
      compiledBlocks: resolved.context.compiledBlocks,
    };
  }
}
