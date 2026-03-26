import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { fullAuditOutputSchema } from "../../../services/audit/auditSchemas";

export interface AuditChapterPromptInput {
  novelTitle: string;
  chapterTitle: string;
  requestedTypes: string[];
  storyModeContext: string;
  content: string;
  ragContext: string;
}

export const auditChapterPrompt: PromptAsset<AuditChapterPromptInput, z.infer<typeof fullAuditOutputSchema>> = {
  id: "audit.chapter.full",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: fullAuditOutputSchema,
  render: (input) => [
    new SystemMessage(
      "You are a novel audit assistant. Return strict JSON only with score, issues, and auditReports. auditReports may only use continuity, character, plot, or mode_fit. Every issue must include severity, code, description, evidence, and fixSuggestion.",
    ),
    new HumanMessage(`小说：${input.novelTitle}
章节：${input.chapterTitle}
审计范围：${input.requestedTypes.join(",")}

流派模式约束：
${input.storyModeContext || "无"}

正文：
${input.content}

检索补充：
${input.ragContext || "无"}

要求：
1. score 维持兼容字段 coherence, repetition, pacing, voice, engagement, overall。
2. issues 输出旧版兼容问题数组。
3. auditReports 输出结构化审计结果，至少覆盖请求的类型。
4. continuity 检查事件、信息、状态、因果是否连贯。
5. character 检查人物动机、反应、关系变化是否自洽。
6. plot 检查推进是否有效、节奏是否失衡、钩子和兑现是否成立。
7. mode_fit 必须检查本章是否违背主流派模式的核心驱动、读者奖励、冲突上限、禁止信号；副流派模式只能补充风味，不能推翻主模式边界。
8. 如果没有明显问题，也要给出简短 summary，并在 auditReports 中保留对应类型。`),
  ],
};
