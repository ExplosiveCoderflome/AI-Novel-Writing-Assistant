import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";

interface ExtractFormulaInput {
  name: string;
  sourceText: string;
  extractLevel: "basic" | "standard" | "deep";
  focusAreas: string[];
  provider?: LLMProvider;
  model?: string;
}

interface ApplyFormulaInput {
  formulaId?: string;
  formulaContent?: string;
  mode: "rewrite" | "generate";
  sourceText?: string;
  topic?: string;
  targetLength?: number;
  provider?: LLMProvider;
  model?: string;
}

function pickSection(content: string, heading: string): string | undefined {
  const regex = new RegExp(`##\\s*${heading}[\\s\\S]*?(?=\\n##\\s|$)`, "i");
  const matched = content.match(regex)?.[0];
  if (!matched) {
    return undefined;
  }
  return matched.replace(new RegExp(`##\\s*${heading}`, "i"), "").trim();
}

export class WritingFormulaService {
  async listFormulas() {
    return prisma.writingFormula.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  async getFormulaById(id: string) {
    return prisma.writingFormula.findUnique({
      where: { id },
    });
  }

  async deleteFormula(id: string) {
    await prisma.writingFormula.delete({
      where: { id },
    });
  }

  async createExtractStream(input: ExtractFormulaInput) {
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: 0.6,
    });

    const stream = await llm.stream([
      new SystemMessage(
        `你是一个专业的写作风格分析专家，能够深度解析文学作品的创作技巧。
请对文本进行 ${input.extractLevel} 级别分析，重点关注：${input.focusAreas.join(", ")}。
输出格式（Markdown）：
## 整体风格定位
## 核心写作技巧（含原文例句）
## 可复现的写作公式
## 应用指南（如何用这个公式写新文本）`,
      ),
      new HumanMessage(input.sourceText),
    ]);

    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        await prisma.writingFormula.create({
          data: {
            name: input.name,
            sourceText: input.sourceText,
            content: fullContent,
            style: pickSection(fullContent, "整体风格定位"),
            formulaDescription: pickSection(fullContent, "核心写作技巧（含原文例句）"),
            formulaSteps: pickSection(fullContent, "可复现的写作公式"),
            applicationTips: pickSection(fullContent, "应用指南（如何用这个公式写新文本）"),
          },
        });
      },
    };
  }

  async createApplyStream(input: ApplyFormulaInput) {
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: 0.7,
    });

    const formulaContent =
      input.formulaContent ??
      (input.formulaId
        ? (await prisma.writingFormula.findUnique({ where: { id: input.formulaId } }))?.content
        : undefined);

    if (!formulaContent) {
      throw new Error("未找到可用写作公式内容。");
    }

    if (input.mode === "rewrite") {
      if (!input.sourceText) {
        throw new Error("rewrite 模式需要 sourceText。");
      }
      const stream = await llm.stream([
        new SystemMessage(
          "你是一位专业的写作助手。请严格按照以下写作公式，对给定文本进行改写。要求：保持原文核心意思不变，但文风、节奏、句式按照公式重塑。",
        ),
        new HumanMessage(`写作公式：\n${formulaContent}\n\n原文：\n${input.sourceText}`),
      ]);
      return {
        stream: stream as AsyncIterable<BaseMessageChunk>,
      };
    }

    if (!input.topic) {
      throw new Error("generate 模式需要 topic。");
    }
    const targetLength = input.targetLength ?? 1200;
    const stream = await llm.stream([
      new SystemMessage(
        `你是一位专业的写作助手。请严格按照以下写作公式，围绕给定主题创作新内容。
要求：字数控制在 ${targetLength} 字左右，每个段落都体现公式核心特征。`,
      ),
      new HumanMessage(`写作公式：\n${formulaContent}\n\n创作主题：\n${input.topic}`),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
    };
  }
}
