import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import { mapAntiAiRuleRow, serializeJson } from "./helpers";

interface AntiAiRuleInput {
  key: string;
  name: string;
  type: AntiAiRule["type"];
  severity: AntiAiRule["severity"];
  description: string;
  detectPatterns?: string[];
  rewriteSuggestion?: string;
  promptInstruction?: string;
  autoRewrite?: boolean;
  enabled?: boolean;
}

export class AntiAiRuleService {
  async listRules(): Promise<AntiAiRule[]> {
    await ensureStyleEngineSeedData();
    const rows = await prisma.antiAiRule.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    return rows.map((row) => mapAntiAiRuleRow(row));
  }

  async createRule(input: AntiAiRuleInput): Promise<AntiAiRule> {
    const row = await prisma.antiAiRule.create({
      data: {
        key: input.key,
        name: input.name,
        type: input.type,
        severity: input.severity,
        description: input.description,
        detectPatternsJson: serializeJson(input.detectPatterns ?? []),
        rewriteSuggestion: input.rewriteSuggestion,
        promptInstruction: input.promptInstruction,
        autoRewrite: input.autoRewrite ?? false,
        enabled: input.enabled ?? true,
      },
    });
    return mapAntiAiRuleRow(row);
  }

  async updateRule(id: string, input: Partial<AntiAiRuleInput>): Promise<AntiAiRule> {
    const row = await prisma.antiAiRule.update({
      where: { id },
      data: {
        key: input.key,
        name: input.name,
        type: input.type,
        severity: input.severity,
        description: input.description,
        detectPatternsJson: input.detectPatterns ? serializeJson(input.detectPatterns) : undefined,
        rewriteSuggestion: input.rewriteSuggestion,
        promptInstruction: input.promptInstruction,
        autoRewrite: input.autoRewrite,
        enabled: input.enabled,
      },
    });
    return mapAntiAiRuleRow(row);
  }
}
