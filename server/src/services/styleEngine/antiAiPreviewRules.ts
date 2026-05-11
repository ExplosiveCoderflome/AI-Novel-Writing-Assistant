import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { mapAntiAiRuleRow } from "./helpers";

function normalizeRuleIds(ruleIds: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawId of ruleIds ?? []) {
    const id = rawId.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

export async function listPreviewAntiAiRules(ruleIds: string[] | undefined): Promise<AntiAiRule[]> {
  const ids = normalizeRuleIds(ruleIds);
  if (ids.length === 0) {
    return [];
  }

  const rows = await prisma.antiAiRule.findMany({
    where: {
      id: { in: ids },
    },
  });
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows
    .map((row) => mapAntiAiRuleRow(row))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function mergeAntiAiRules(baseRules: AntiAiRule[], previewRules: AntiAiRule[]): AntiAiRule[] {
  const seen = new Set<string>();
  const result: AntiAiRule[] = [];
  for (const rule of [...baseRules, ...previewRules]) {
    if (seen.has(rule.id)) {
      continue;
    }
    seen.add(rule.id);
    result.push(rule);
  }
  return result;
}

export function buildAntiAiRuleCatalogText(rules: AntiAiRule[]): string {
  return rules
    .map((rule) => `- [${rule.id}] ${rule.name} (${rule.type}/${rule.severity}): ${rule.promptInstruction ?? rule.description}`)
    .join("\n");
}

export function buildAntiAiRuleDirectiveText(rules: AntiAiRule[]): string {
  if (rules.length === 0) {
    return "";
  }

  return [
    "Temporary anti-AI test rules:",
    ...rules.map((rule) => {
      const instruction = rule.promptInstruction?.trim() || rule.description;
      const suggestion = rule.rewriteSuggestion?.trim();
      return `- [${rule.id}] ${rule.name} (${rule.type}/${rule.severity}): ${instruction}${suggestion ? ` 修正建议：${suggestion}` : ""}`;
    }),
  ].join("\n");
}
