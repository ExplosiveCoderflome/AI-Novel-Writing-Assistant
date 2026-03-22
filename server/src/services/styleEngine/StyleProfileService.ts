import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StyleExtractionDraft, StyleFeatureDecision, StyleProfile, StyleProfileFeature, StyleRuleSet, StyleSourceType, StyleTemplate } from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import { mapStyleProfileRow, mapStyleTemplateRow, extractJsonObject, serializeJson, toLlmText } from "./helpers";
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

interface GeneratedStylePayload extends StyleRuleSet {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  applicableGenres?: string[];
  analysisMarkdown?: string;
  antiAiRuleKeys?: string[];
}

type GeneratedStyleExtractionPayload = StyleExtractionDraft;

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
    const generated = await this.generateStructuredExtraction(
      `你是小说写法特征提取器。
请从用户提供的文本里尽量完整提取“可用于仿写或写法迁移”的全部关键特征，并严格输出 JSON 对象。
字段包括：
name, description, category, tags, applicableGenres, analysisMarkdown, summary, antiAiRuleKeys, features, presets。
要求：
1. features 必须尽量覆盖叙事、语言、对话、节奏、指纹特征，不要为了安全而过度删减。
2. 每个 feature 都必须提供 keepRulePatch；如果适合“弱化”，再提供 weakenRulePatch。
3. importance / imitationValue / transferability / fingerprintRisk 都用 0-1 小数。
4. presets 必须至少包含 imitate / balanced / transfer 三套建议。
5. antiAiRuleKeys 只能推荐系统已有规则 key。
6. 只输出 JSON，不要输出解释。`,
      `写法名称：${input.name}
建议分类：${input.category ?? "未指定"}

原文：
${input.sourceText}`,
      input,
    );
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
    const generated = await this.generateStructuredStyle(
      `请把拆书分析中的“文风与技法”转成可执行写法资产。输出 JSON，字段包括：
name, description, category, tags, applicableGenres, analysisMarkdown,
narrativeRules, characterRules, languageRules, rhythmRules, antiAiRuleKeys。
要求：
1. narrativeRules / characterRules / languageRules / rhythmRules 必须是结构化对象。
2. antiAiRuleKeys 只能推荐系统已有规则 key。
3. 不要输出解释文字，只输出 JSON 对象。`,
      `拆书分析标题：${section.analysis.title}
写法名称：${input.name}

拆书中的文风与技法：
${sourceText}`,
      input,
    );
    return this.persistGeneratedProfile({
      inputName: input.name,
      sourceType: "from_book_analysis",
      sourceRefId: input.bookAnalysisId,
      sourceContent: sourceText,
      generated,
    });
  }

  private async generateStructuredStyle(systemPrompt: string, userPrompt: string, llmInput: LlmInput): Promise<GeneratedStylePayload> {
    const result = await this.invokeJson<GeneratedStylePayload>(systemPrompt, userPrompt, llmInput);
    return result;
  }

  private async generateStructuredExtraction(systemPrompt: string, userPrompt: string, llmInput: LlmInput): Promise<GeneratedStyleExtractionPayload> {
    const initialResult = await this.invokeJson<GeneratedStyleExtractionPayload>(systemPrompt, userPrompt, llmInput);
    if (this.hasUsableExtractionFeatures(initialResult)) {
      return initialResult;
    }

    return this.invokeJson<GeneratedStyleExtractionPayload>(
      [
        systemPrompt,
        "The previous response did not contain a usable features array.",
        "Retry now and focus on returning a non-empty `features` array.",
        "Each feature must include: id, group, label, description, evidence, importance, imitationValue, transferability, fingerprintRisk, keepRulePatch, optional weakenRulePatch.",
        "If other fields are hard to infer, keep them brief, but do not omit `features`.",
        "Output JSON only.",
      ].join("\n"),
      [
        userPrompt,
        "",
        "Retry requirement:",
        "- Return at least 8 features when the source text is long enough.",
        "- Use the exact field name `features`.",
        "- Allowed group values: narrative, language, dialogue, rhythm, fingerprint.",
      ].join("\n"),
      llmInput,
    );
  }

  private async invokeJson<T>(systemPrompt: string, userPrompt: string, llmInput: LlmInput): Promise<T> {
    const llm = await getLLM(llmInput.provider ?? "deepseek", {
      model: llmInput.model,
      temperature: llmInput.temperature ?? 0.5,
    });
    const result = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    return extractJsonObject<T>(toLlmText(result.content));
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
      description: input.generated.description,
      category: input.generated.category,
      tags: input.generated.tags ?? [],
      applicableGenres: input.generated.applicableGenres ?? [],
      sourceType: input.sourceType,
      sourceRefId: input.sourceRefId,
      sourceContent: input.sourceContent,
      analysisMarkdown: input.generated.analysisMarkdown,
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
