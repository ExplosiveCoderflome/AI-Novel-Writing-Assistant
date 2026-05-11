import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  AntiAiRule,
  AntiAiRuleAiDraftRequest,
  AntiAiRuleAiDraftResult,
  AntiAiRuleDraftFields,
} from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { antiAiRuleAiDraftPrompt } from "../../prompting/prompts/style/style.prompts";
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
  globalBaselineEnabled?: boolean;
}

interface AntiAiRuleAiDraftInput extends AntiAiRuleAiDraftRequest {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const FALLBACK_KEY_PREFIX = "anti_ai_rule";

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )).slice(0, 12);
}

function normalizeKeyCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function buildKeyFromText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const normalized = normalizeKeyCandidate(value);
    if (normalized) {
      return normalized;
    }
  }
  return FALLBACK_KEY_PREFIX;
}

function formatCurrentRuleForPrompt(rule: AntiAiRuleDraftFields): string {
  return [
    `key: ${rule.key}`,
    `name: ${rule.name}`,
    `type: ${rule.type}`,
    `severity: ${rule.severity}`,
    `description: ${rule.description}`,
    `detectPatterns: ${rule.detectPatterns.join(" / ") || "无"}`,
    `promptInstruction: ${rule.promptInstruction ?? "无"}`,
    `rewriteSuggestion: ${rule.rewriteSuggestion ?? "无"}`,
  ].join("\n");
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
        globalBaselineEnabled: input.globalBaselineEnabled ?? false,
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
        globalBaselineEnabled: input.globalBaselineEnabled,
      },
    });
    return mapAntiAiRuleRow(row);
  }

  async generateAiDraft(input: AntiAiRuleAiDraftInput): Promise<AntiAiRuleAiDraftResult> {
    await ensureStyleEngineSeedData();
    const result = await runStructuredPrompt({
      asset: antiAiRuleAiDraftPrompt,
      promptInput: {
        mode: input.mode,
        instruction: input.instruction,
        currentRuleText: input.currentRule ? formatCurrentRuleForPrompt(input.currentRule) : undefined,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? (input.mode === "create" ? 0.5 : 0.35),
        maxTokens: 900,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      },
    });

    const output = result.output;
    const rawDraft = output.draft;
    const draft: AntiAiRuleDraftFields = {
      key: await this.resolveDraftKey({
        mode: input.mode,
        generatedKey: rawDraft.key,
        generatedName: rawDraft.name,
        instruction: input.instruction,
        currentRule: input.currentRule,
      }),
      name: rawDraft.name?.trim() || input.currentRule?.name || "反 AI 规则草稿",
      type: rawDraft.type ?? input.currentRule?.type ?? "risk",
      severity: rawDraft.severity ?? input.currentRule?.severity ?? "medium",
      description: rawDraft.description?.trim() || input.currentRule?.description || "根据用户需求生成的反 AI 规则。",
      detectPatterns: normalizePatterns(rawDraft.detectPatterns),
      promptInstruction: normalizeOptionalText(rawDraft.promptInstruction) ?? input.currentRule?.promptInstruction ?? null,
      rewriteSuggestion: normalizeOptionalText(rawDraft.rewriteSuggestion) ?? input.currentRule?.rewriteSuggestion ?? null,
      enabled: input.mode === "improve" ? input.currentRule?.enabled ?? true : true,
      globalBaselineEnabled: input.mode === "improve" ? input.currentRule?.globalBaselineEnabled ?? false : false,
      autoRewrite: input.mode === "improve" ? input.currentRule?.autoRewrite ?? false : false,
    };

    return {
      draft,
      rationale: output.rationale?.trim() || "已根据用户需求整理为可编辑的规则草稿。",
      safetyNotes: normalizePatterns(output.safetyNotes),
    };
  }

  private async resolveDraftKey(input: {
    mode: "create" | "improve";
    generatedKey?: string | null;
    generatedName?: string | null;
    instruction: string;
    currentRule?: AntiAiRuleDraftFields;
  }): Promise<string> {
    if (input.mode === "improve" && input.currentRule?.key.trim()) {
      return normalizeKeyCandidate(input.currentRule.key) || input.currentRule.key.trim();
    }

    const baseKey = buildKeyFromText(input.generatedKey, input.generatedName, input.instruction);
    return this.makeUniqueRuleKey(baseKey);
  }

  private async makeUniqueRuleKey(baseKey: string): Promise<string> {
    const normalizedBase = normalizeKeyCandidate(baseKey) || FALLBACK_KEY_PREFIX;
    const existing = await prisma.antiAiRule.findMany({
      where: {
        key: {
          startsWith: normalizedBase,
        },
      },
      select: { key: true },
    });
    const existingKeys = new Set(existing.map((item) => item.key));
    if (!existingKeys.has(normalizedBase)) {
      return normalizedBase;
    }
    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${normalizedBase}_${index}`;
      if (!existingKeys.has(candidate)) {
        return candidate;
      }
    }
    return `${normalizedBase}_${Date.now()}`;
  }
}
