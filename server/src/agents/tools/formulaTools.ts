import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  type ExplainFormulaMatchOutput,
  explainFormulaMatchInputSchema,
  explainFormulaMatchOutputSchema,
  getWritingFormulaDetailOutputSchema,
  listWritingFormulasInputSchema,
  listWritingFormulasOutputSchema,
  writingFormulaIdInputSchema,
} from "./formulaToolSchemas";

function collectFormulaSignals(row: {
  genre: string | null;
  style: string | null;
  toneVoice: string | null;
  themes: string | null;
  motifs: string | null;
}) {
  return [
    row.genre?.trim(),
    row.style?.trim(),
    row.toneVoice?.trim(),
    row.themes?.trim(),
    row.motifs?.trim(),
  ].filter((item): item is string => Boolean(item));
}

export const formulaToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  list_writing_formulas: {
    name: "list_writing_formulas",
    title: "列出写作公式",
    description: "读取写作公式列表和最近风格属性。",
    category: "read",
    riskLevel: "low",
    domainAgent: "FormulaAgent",
    resourceScopes: ["writing_formula"],
    inputSchema: listWritingFormulasInputSchema,
    outputSchema: listWritingFormulasOutputSchema,
    execute: async (_context, rawInput) => {
      const input = listWritingFormulasInputSchema.parse(rawInput);
      const rows = await prisma.writingFormula.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit ?? 20,
      });
      return listWritingFormulasOutputSchema.parse({
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          genre: row.genre ?? null,
          style: row.style ?? null,
          toneVoice: row.toneVoice ?? null,
          updatedAt: row.updatedAt.toISOString(),
        })),
        summary: `已读取 ${rows.length} 条写作公式。`,
      });
    },
  },
  get_writing_formula_detail: {
    name: "get_writing_formula_detail",
    title: "读取写作公式详情",
    description: "读取写作公式的风格、步骤和应用建议。",
    category: "read",
    riskLevel: "low",
    domainAgent: "FormulaAgent",
    resourceScopes: ["writing_formula"],
    inputSchema: writingFormulaIdInputSchema,
    outputSchema: getWritingFormulaDetailOutputSchema,
    execute: async (_context, rawInput) => {
      const input = writingFormulaIdInputSchema.parse(rawInput);
      const row = await prisma.writingFormula.findUnique({
        where: { id: input.formulaId },
      });
      if (!row) {
        throw new AgentToolError("NOT_FOUND", "Writing formula not found.");
      }
      return getWritingFormulaDetailOutputSchema.parse({
        id: row.id,
        name: row.name,
        genre: row.genre ?? null,
        style: row.style ?? null,
        toneVoice: row.toneVoice ?? null,
        formulaDescription: row.formulaDescription ?? null,
        formulaSteps: row.formulaSteps ?? null,
        applicationTips: row.applicationTips ?? null,
        updatedAt: row.updatedAt.toISOString(),
        summary: `已读取写作公式《${row.name}》。`,
      });
    },
  },
  explain_formula_match: {
    name: "explain_formula_match",
    title: "解释公式适配性",
    description: "根据样本文本、章节或小说大纲，解释当前写作公式的适配信号。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "FormulaAgent",
    resourceScopes: ["writing_formula", "novel", "chapter"],
    inputSchema: explainFormulaMatchInputSchema,
    outputSchema: explainFormulaMatchOutputSchema,
    execute: async (_context, rawInput) => {
      const input = explainFormulaMatchInputSchema.parse(rawInput);
      const row = await prisma.writingFormula.findUnique({
        where: { id: input.formulaId },
      });
      if (!row) {
        throw new AgentToolError("NOT_FOUND", "Writing formula not found.");
      }
      let basisText = input.sampleText?.trim() ?? "";
      let basisType: ExplainFormulaMatchOutput["basisType"] = "formula_only";
      if (!basisText && input.chapterId) {
        const chapter = await prisma.chapter.findUnique({
          where: { id: input.chapterId },
          select: { content: true },
        });
        basisText = chapter?.content?.trim() ?? "";
        basisType = basisText ? "chapter" : basisType;
      }
      if (!basisText && input.novelId) {
        const novel = await prisma.novel.findUnique({
          where: { id: input.novelId },
          select: { structuredOutline: true, outline: true },
        });
        basisText = novel?.structuredOutline?.trim() || novel?.outline?.trim() || "";
        basisType = basisText ? "novel_outline" : basisType;
      }
      if (input.sampleText?.trim()) {
        basisType = "sample_text";
      }
      const signals = collectFormulaSignals(row);
      const matchedSignals = basisText
        ? signals.filter((signal) => basisText.includes(signal.slice(0, Math.min(signal.length, 8))))
        : [];
      const missingSignals = signals.filter((signal) => !matchedSignals.includes(signal));
      const summary = basisText
        ? matchedSignals.length > 0
          ? `公式《${row.name}》与当前上下文命中了 ${matchedSignals.length} 条风格信号。`
          : `公式《${row.name}》已读取，但当前上下文未出现明确命中信号。`
        : `公式《${row.name}》已读取，但当前没有可用于比对的上下文文本。`;
      return explainFormulaMatchOutputSchema.parse({
        formulaId: row.id,
        basisType,
        matchedSignals,
        missingSignals,
        summary,
      });
    },
  },
};
