import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StyleExtractionDraft, StyleFeatureDecision, StyleProfile, StyleProfileFeature, StyleSourceType, StyleTemplate } from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  styleProfileFromBriefPrompt,
  styleProfileExtractionPrompt,
  styleProfileFromBookAnalysisPrompt,
} from "../../prompting/prompts/style/style.prompts";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import { mapStyleProfileRow, mapStyleTemplateRow, serializeJson } from "./helpers";
import {
  buildExtractionAnalysisMarkdown,
  buildProfileFeatureAnalysisMarkdown,
  buildProfileFeaturesFromDraft,
  buildRuleSetFromExtraction,
  buildRuleSetFromProfileFeatures,
  normalizeStyleExtractionDraft,
  normalizeStyleProfileFeatures,
} from "./styleExtraction";

interface ManualProfileInput {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  applicableGenres?: string[];
  sourceType?: StyleSourceType;
  sourceRefId?: string;
  sourceContent?: string;
  extractedFeatures?: StyleProfileFeature[];
  analysisMarkdown?: string;
  narrativeRules?: Record<string, unknown>;
  characterRules?: Record<string, unknown>;
  languageRules?: Record<string, unknown>;
  rhythmRules?: Record<string, unknown>;
  antiAiRuleIds?: string[];
}

interface LlmInput {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface GeneratedStylePayload {
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  applicableGenres?: string[];
  analysisMarkdown?: string | null;
  antiAiRuleKeys?: string[];
  narrativeRules?: Record<string, unknown>;
  characterRules?: Record<string, unknown>;
  languageRules?: Record<string, unknown>;
  rhythmRules?: Record<string, unknown>;
}

const AI_STYLE_BRIEF_SOURCE_PREFIX = "ai-style-brief:";

export class StyleProfileService {
  async listProfiles(): Promise<StyleProfile[]> {
    await ensureStyleEngineSeedData();
    const rows = await prisma.styleProfile.findMany({
      include: {
        antiAiBindings: {
          where: { enabled: true },
          include: { antiAiRule: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => mapStyleProfileRow(row));
  }

  async getProfileById(id: string): Promise<StyleProfile | null> {
    await ensureStyleEngineSeedData();
    const row = await prisma.styleProfile.findUnique({
      where: { id },
      include: {
        antiAiBindings: {
          where: { enabled: true },
          include: { antiAiRule: true },
        },
      },
    });
    return row ? mapStyleProfileRow(row) : null;
  }

  async createManualProfile(input: ManualProfileInput): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const row = await prisma.styleProfile.create({
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        tagsJson: serializeJson(input.tags ?? []),
        applicableGenresJson: serializeJson(input.applicableGenres ?? []),
        sourceType: input.sourceType ?? "manual",
        sourceRefId: input.sourceRefId,
        sourceContent: input.sourceContent,
        extractedFeaturesJson: serializeJson(input.extractedFeatures ?? []),
        analysisMarkdown: input.analysisMarkdown,
        narrativeRulesJson: serializeJson(input.narrativeRules ?? {}),
        characterRulesJson: serializeJson(input.characterRules ?? {}),
        languageRulesJson: serializeJson(input.languageRules ?? {}),
        rhythmRulesJson: serializeJson(input.rhythmRules ?? {}),
        antiAiBindings: input.antiAiRuleIds?.length
          ? {
              create: input.antiAiRuleIds.map((antiAiRuleId) => ({
                antiAiRuleId,
                enabled: true,
              })),
            }
          : undefined,
      },
      include: {
        antiAiBindings: {
          include: { antiAiRule: true },
        },
      },
    });
    return mapStyleProfileRow(row);
  }

  async updateProfile(id: string, input: Omit<ManualProfileInput, "sourceType"> & { status?: string }): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const normalizedExtractedFeatures = input.extractedFeatures
      ? normalizeStyleProfileFeatures(input.extractedFeatures)
      : null;
    const compiledRuleSet = normalizedExtractedFeatures
      ? buildRuleSetFromProfileFeatures(normalizedExtractedFeatures)
      : null;
    await prisma.styleProfile.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        tagsJson: input.tags ? serializeJson(input.tags) : undefined,
        applicableGenresJson: input.applicableGenres ? serializeJson(input.applicableGenres) : undefined,
        sourceRefId: input.sourceRefId,
        sourceContent: input.sourceContent,
        extractedFeaturesJson: normalizedExtractedFeatures ? serializeJson(normalizedExtractedFeatures) : undefined,
        analysisMarkdown: input.analysisMarkdown,
        narrativeRulesJson: compiledRuleSet
          ? serializeJson(compiledRuleSet.narrativeRules)
          : (input.narrativeRules ? serializeJson(input.narrativeRules) : undefined),
        characterRulesJson: compiledRuleSet
          ? serializeJson(compiledRuleSet.characterRules)
          : (input.characterRules ? serializeJson(input.characterRules) : undefined),
        languageRulesJson: compiledRuleSet
          ? serializeJson(compiledRuleSet.languageRules)
          : (input.languageRules ? serializeJson(input.languageRules) : undefined),
        rhythmRulesJson: compiledRuleSet
          ? serializeJson(compiledRuleSet.rhythmRules)
          : (input.rhythmRules ? serializeJson(input.rhythmRules) : undefined),
        status: input.status,
      },
    });

    if (input.antiAiRuleIds) {
      await prisma.styleProfileAntiAiRule.deleteMany({
        where: { styleProfileId: id },
      });
      if (input.antiAiRuleIds.length > 0) {
        await prisma.styleProfileAntiAiRule.createMany({
          data: input.antiAiRuleIds.map((antiAiRuleId) => ({
            styleProfileId: id,
            antiAiRuleId,
            enabled: true,
          })),
        });
      }
    }

    const updated = await this.getProfileById(id);
    if (!updated) {
      throw new Error("写法资产不存在。");
    }
    return updated;
  }

  async deleteProfile(id: string): Promise<void> {
    await prisma.styleProfile.delete({ where: { id } });
  }

  async listTemplates(): Promise<StyleTemplate[]> {
    await ensureStyleEngineSeedData();
    const rows = await prisma.styleTemplate.findMany({
      orderBy: { name: "asc" },
    });
    return rows.map((row) => mapStyleTemplateRow(row));
  }

  async createFromTemplate(input: { templateId: string; name?: string }): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const template = await prisma.styleTemplate.findUnique({ where: { id: input.templateId } });
    if (!template) {
      throw new Error("写法模板不存在。");
    }
    const antiRules = await prisma.antiAiRule.findMany({
      where: {
        key: {
          in: JSON.parse(template.defaultAntiAiRuleKeysJson ?? "[]"),
        },
      },
      orderBy: { name: "asc" },
    });
    return this.createManualProfile({
      name: input.name?.trim() || template.name,
      description: template.description,
      category: template.category,
      tags: JSON.parse(template.tagsJson ?? "[]"),
      applicableGenres: JSON.parse(template.applicableGenresJson ?? "[]"),
      sourceType: "manual",
      analysisMarkdown: template.analysisMarkdown ?? undefined,
      narrativeRules: JSON.parse(template.narrativeRulesJson ?? "{}"),
      characterRules: JSON.parse(template.characterRulesJson ?? "{}"),
      languageRules: JSON.parse(template.languageRulesJson ?? "{}"),
      rhythmRules: JSON.parse(template.rhythmRulesJson ?? "{}"),
      antiAiRuleIds: antiRules.map((rule) => rule.id),
    });
  }

  async createFromText(input: {
    name: string;
    sourceText: string;
    category?: string;
  } & LlmInput): Promise<StyleProfile> {
    const draft = await this.extractFromText(input);
    const extractedFeatures = buildProfileFeaturesFromDraft(draft);
    const ruleSet = buildRuleSetFromProfileFeatures(extractedFeatures);
    const antiAiRuleIds = await this.resolveAntiAiRuleIds(draft.antiAiRuleKeys);

    return this.createManualProfile({
      name: draft.name,
      description: draft.description ?? "基于文本提取生成的写法资产。",
      category: draft.category || undefined,
      tags: draft.tags,
      applicableGenres: draft.applicableGenres,
      sourceType: "from_text",
      sourceContent: input.sourceText,
      extractedFeatures,
      analysisMarkdown: buildProfileFeatureAnalysisMarkdown(draft.summary, extractedFeatures),
      narrativeRules: ruleSet.narrativeRules,
      characterRules: ruleSet.characterRules,
      languageRules: ruleSet.languageRules,
      rhythmRules: ruleSet.rhythmRules,
      antiAiRuleIds,
    });
  }

  async extractFromText(input: {
    name: string;
    sourceText: string;
    category?: string;
  } & LlmInput): Promise<StyleExtractionDraft> {
    await ensureStyleEngineSeedData();
    const generated = await this.generateStructuredExtraction(input);
    return normalizeStyleExtractionDraft(generated, input.name, input.category);
  }

  async createProfileFromExtraction(input: {
    name: string;
    sourceText: string;
    category?: string;
    draft: StyleExtractionDraft;
    decisions: Array<{ featureId: string; decision: StyleFeatureDecision }>;
    presetKey?: "imitate" | "balanced" | "transfer";
  }): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const normalizedDraft = normalizeStyleExtractionDraft(input.draft, input.name, input.category);
    const ruleSet = buildRuleSetFromExtraction(normalizedDraft, input.decisions, input.presetKey);
    const extractedFeatures = buildProfileFeaturesFromDraft(normalizedDraft).map((feature) => ({
      ...feature,
      enabled: (input.decisions.find((item) => item.featureId === feature.id)?.decision ?? "keep") !== "remove",
    }));
    const antiAiRuleIds = await this.resolveAntiAiRuleIds(normalizedDraft.antiAiRuleKeys);

    return this.createManualProfile({
      name: input.name.trim() || normalizedDraft.name,
      description: normalizedDraft.description
        ?? `基于文本提取生成，保留 ${input.decisions.filter((item) => item.decision === "keep").length} 项特征，弱化 ${input.decisions.filter((item) => item.decision === "weaken").length} 项特征。`,
      category: input.category?.trim() || normalizedDraft.category || undefined,
      tags: normalizedDraft.tags,
      applicableGenres: normalizedDraft.applicableGenres,
      sourceType: "from_text",
      sourceContent: input.sourceText,
      extractedFeatures,
      analysisMarkdown: buildExtractionAnalysisMarkdown(normalizedDraft, input.decisions, input.presetKey),
      narrativeRules: ruleSet.narrativeRules,
      characterRules: ruleSet.characterRules,
      languageRules: ruleSet.languageRules,
      rhythmRules: ruleSet.rhythmRules,
      antiAiRuleIds,
    });
  }

  async createFromBookAnalysis(input: {
    bookAnalysisId: string;
    name: string;
  } & LlmInput): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const section = await prisma.bookAnalysisSection.findFirst({
      where: {
        analysisId: input.bookAnalysisId,
        sectionKey: "style_technique",
      },
      include: {
        analysis: true,
      },
    });
    if (!section) {
      throw new Error("未找到可用于生成写法的拆书文风与技法小节。");
    }
    const sourceText = section.editedContent?.trim() || section.aiContent?.trim();
    if (!sourceText) {
      throw new Error("拆书文风与技法小节为空，无法生成写法资产。");
    }
    const generated = await this.generateStructuredStyle({
      analysisTitle: section.analysis.title,
      name: input.name,
      sourceText,
    }, input);
    return this.persistGeneratedProfile({
      inputName: input.name,
      sourceType: "from_book_analysis",
      sourceRefId: input.bookAnalysisId,
      sourceContent: sourceText,
      generated,
    });
  }

  async createFromBrief(input: {
    brief: string;
    name?: string;
    category?: string;
  } & LlmInput): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const generated = await this.generateStructuredStyleFromBrief({
      brief: input.brief,
      name: input.name?.trim() || undefined,
      category: input.category?.trim() || undefined,
    }, input);
    return this.persistGeneratedProfile({
      inputName: input.name?.trim() || generated.name?.trim() || "AI 生成写法",
      sourceType: "manual",
      sourceRefId: `${AI_STYLE_BRIEF_SOURCE_PREFIX}${Date.now()}`,
      sourceContent: input.brief,
      generated,
    });
  }

  private async generateStructuredStyle(
    promptInput: {
      analysisTitle: string;
      name: string;
      sourceText: string;
    },
    llmInput: LlmInput,
  ): Promise<GeneratedStylePayload> {
    const result = await runStructuredPrompt({
      asset: styleProfileFromBookAnalysisPrompt,
      promptInput,
      options: {
        provider: llmInput.provider ?? "deepseek",
        model: llmInput.model,
        temperature: llmInput.temperature ?? 0.5,
      },
    });
    return result.output;
  }

  private async generateStructuredStyleFromBrief(
    promptInput: {
      brief: string;
      name?: string;
      category?: string;
    },
    llmInput: LlmInput,
  ): Promise<GeneratedStylePayload> {
    const result = await runStructuredPrompt({
      asset: styleProfileFromBriefPrompt,
      promptInput,
      options: {
        provider: llmInput.provider ?? "deepseek",
        model: llmInput.model,
        temperature: llmInput.temperature ?? 0.6,
      },
    });
    return result.output;
  }

  private async generateStructuredExtraction(input: {
    name: string;
    sourceText: string;
    category?: string;
  } & LlmInput): Promise<StyleExtractionDraft> {
    const initialResult = await runStructuredPrompt({
      asset: styleProfileExtractionPrompt,
      promptInput: {
        name: input.name,
        category: input.category,
        sourceText: input.sourceText,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.5,
      },
    });
    if (this.hasUsableExtractionFeatures(initialResult.output)) {
      return initialResult.output as StyleExtractionDraft;
    }

    const retriedResult = await runStructuredPrompt({
      asset: styleProfileExtractionPrompt,
      promptInput: {
        name: input.name,
        category: input.category,
        sourceText: input.sourceText,
        retryForFeatures: true,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.5,
      },
    });
    return retriedResult.output as StyleExtractionDraft;
  }

  private async persistGeneratedProfile(input: {
    inputName: string;
    sourceType: StyleSourceType;
    sourceRefId?: string;
    sourceContent: string;
    generated: GeneratedStylePayload;
  }): Promise<StyleProfile> {
    const antiAiRuleIds = await this.resolveAntiAiRuleIds(input.generated.antiAiRuleKeys ?? []);
    return this.createManualProfile({
      name: input.generated.name?.trim() || input.inputName,
      description: input.generated.description ?? undefined,
      category: input.generated.category ?? undefined,
      tags: input.generated.tags ?? [],
      applicableGenres: input.generated.applicableGenres ?? [],
      sourceType: input.sourceType,
      sourceRefId: input.sourceRefId,
      sourceContent: input.sourceContent,
      analysisMarkdown: input.generated.analysisMarkdown ?? undefined,
      narrativeRules: input.generated.narrativeRules,
      characterRules: input.generated.characterRules,
      languageRules: input.generated.languageRules,
      rhythmRules: input.generated.rhythmRules,
      antiAiRuleIds,
    });
  }

  private async resolveAntiAiRuleIds(ruleKeys: string[]): Promise<string[]> {
    if (ruleKeys.length === 0) {
      return [];
    }
    const antiRules = await prisma.antiAiRule.findMany({ where: { key: { in: ruleKeys } } });
    return antiRules.map((rule) => rule.id);
  }

  private hasUsableExtractionFeatures(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return [record.features, record.extractedFeatures, record.featurePool]
      .some((candidate) => Array.isArray(candidate) && candidate.length > 0);
  }
}
