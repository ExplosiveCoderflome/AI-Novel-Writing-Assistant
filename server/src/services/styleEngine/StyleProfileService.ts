import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StyleExtractionDraft,
  StyleExtractionPreset,
  StyleFeatureDecision,
  StyleProfile,
  StyleProfileFeature,
  StyleSourceType,
  StyleTemplate,
} from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  styleProfileAntiAiSelectionPrompt,
  styleProfileExtractionPrompt,
  styleProfileFromBookAnalysisPrompt,
  styleProfileFromBriefPrompt,
  styleProfileMetadataPrompt,
} from "../../prompting/prompts/style/style.prompts";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import {
  mapAntiAiRuleRow,
  mapStyleProfileRow,
  mapStyleTemplateRow,
  serializeJson,
} from "./helpers";
import {
  buildAntiAiCatalogText,
  buildStyleAntiAiRiskDigest,
  buildStyleMetadataDigest,
  normalizeStyleAntiAiSelectionDraft,
  normalizeStyleMetadataDraft,
  type StyleCreationCoreDraft,
} from "./styleCreation";
import {
  buildExtractionAnalysisMarkdown,
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
  extractionPresets?: StyleExtractionPreset[];
  extractionAntiAiRuleKeys?: string[];
  selectedExtractionPresetKey?: StyleExtractionPreset["key"] | null;
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
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface GeneratedStyleCorePayload {
  name?: string;
  description?: string | null;
  analysisMarkdown?: string | null;
  narrativeRules?: Record<string, unknown>;
  characterRules?: Record<string, unknown>;
  languageRules?: Record<string, unknown>;
  rhythmRules?: Record<string, unknown>;
}

interface GeneratedStylePayload extends GeneratedStyleCorePayload {
  category?: string | null;
  tags?: string[];
  applicableGenres?: string[];
  antiAiRuleKeys?: string[];
}

const AI_STYLE_BRIEF_SOURCE_PREFIX = "ai-style-brief:";
const STYLE_EXTRACTION_MAX_TOKENS = 4096;
const STYLE_METADATA_MAX_TOKENS = 600;
const STYLE_ANTI_AI_SELECTION_MAX_TOKENS = 500;
const DEFAULT_EXTRACTION_PRESET_KEY: StyleExtractionPreset["key"] = "balanced";
type TextExtractionSourceType = Extract<StyleSourceType, "from_text" | "from_knowledge_document">;

function formatRuntimeLogValue(value: unknown): string {
  if (value == null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function logStyleExtractionRuntimeEvent(event: string, payload: Record<string, unknown>): void {
  const parts = ["[style.extraction.runtime]", `event=${event}`];
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${formatRuntimeLogValue(value)}`);
  }
  console.info(parts.join(" "));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRuleRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function countExtractionFeatures(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }
  const record = value as Record<string, unknown>;
  const candidates = [record.features, record.extractedFeatures, record.featurePool];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.length;
    }
  }
  return 0;
}

function buildGeneratedCoreDraftSummary(input: {
  name: string;
  description?: string | null;
  analysisMarkdown?: string | null;
  narrativeRules?: Record<string, unknown>;
  characterRules?: Record<string, unknown>;
  languageRules?: Record<string, unknown>;
  rhythmRules?: Record<string, unknown>;
}): StyleCreationCoreDraft {
  return {
    name: input.name,
    description: input.description,
    analysisMarkdown: input.analysisMarkdown,
    ruleSet: {
      narrativeRules: input.narrativeRules ?? {},
      characterRules: input.characterRules ?? {},
      languageRules: input.languageRules ?? {},
      rhythmRules: input.rhythmRules ?? {},
    },
  };
}

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
        extractionPresetsJson: serializeJson(input.extractionPresets ?? []),
        extractionAntiAiRuleKeysJson: serializeJson(input.extractionAntiAiRuleKeys ?? []),
        selectedExtractionPresetKey: input.selectedExtractionPresetKey ?? null,
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

  async updateProfile(
    id: string,
    input: Omit<ManualProfileInput, "sourceType"> & { status?: string },
  ): Promise<StyleProfile> {
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
    const balancedPreset = draft.presets.find((item) => item.key === DEFAULT_EXTRACTION_PRESET_KEY)
      ?? draft.presets[0];
    return this.createProfileFromExtraction({
      name: input.name,
      sourceText: input.sourceText,
      category: input.category,
      draft,
      presetKey: DEFAULT_EXTRACTION_PRESET_KEY,
      decisions: balancedPreset?.decisions ?? draft.features.map((feature) => ({
        featureId: feature.id,
        decision: "keep" as StyleFeatureDecision,
      })),
    });
  }

  async extractFromText(input: {
    name: string;
    sourceText: string;
    category?: string;
  } & LlmInput): Promise<StyleExtractionDraft> {
    await ensureStyleEngineSeedData();
    const coreDraft = normalizeStyleExtractionDraft(
      await this.generateStructuredExtractionCore(input),
      input.name,
      input.category,
    );
    return this.enrichExtractionDraft(coreDraft, input);
  }

  async createProfileFromExtraction(input: {
    name: string;
    sourceText: string;
    category?: string;
    draft: StyleExtractionDraft;
    decisions: Array<{ featureId: string; decision: StyleFeatureDecision }>;
    presetKey?: "imitate" | "balanced" | "transfer";
    sourceType?: TextExtractionSourceType;
    sourceRefId?: string;
  }): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const sourceType = input.sourceType ?? "from_text";
    const normalizedDraft = normalizeStyleExtractionDraft(input.draft, input.name, input.category);
    const ruleSet = buildRuleSetFromExtraction(normalizedDraft, input.decisions, input.presetKey);
    const extractedFeatures = buildProfileFeaturesFromDraft(normalizedDraft).map((feature) => ({
      ...feature,
      selectedDecision: input.decisions.find((item) => item.featureId === feature.id)?.decision ?? "keep",
      enabled: (input.decisions.find((item) => item.featureId === feature.id)?.decision ?? "keep") !== "remove",
    }));
    const antiAiRuleIds = await this.resolveAntiAiRuleIds(normalizedDraft.antiAiRuleKeys);

    return this.createManualProfile({
      name: input.name.trim() || normalizedDraft.name,
      description: normalizedDraft.description
        ?? `${sourceType === "from_knowledge_document" ? "基于知识库原文提取生成" : "基于文本提取生成"}，保留 ${input.decisions.filter((item) => item.decision === "keep").length} 项特征，弱化 ${input.decisions.filter((item) => item.decision === "weaken").length} 项特征。`,
      category: input.category?.trim() || normalizedDraft.category || undefined,
      tags: normalizedDraft.tags,
      applicableGenres: normalizedDraft.applicableGenres,
      sourceType,
      sourceRefId: input.sourceRefId,
      sourceContent: input.sourceText,
      extractedFeatures,
      extractionPresets: normalizedDraft.presets,
      extractionAntiAiRuleKeys: normalizedDraft.antiAiRuleKeys,
      selectedExtractionPresetKey: input.presetKey ?? DEFAULT_EXTRACTION_PRESET_KEY,
      analysisMarkdown: normalizedDraft.analysisMarkdown
        ?? buildExtractionAnalysisMarkdown(normalizedDraft, input.decisions, input.presetKey),
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
    const generatedCore = await this.generateStructuredStyle(
      {
        analysisTitle: section.analysis.title,
        name: input.name,
        sourceText,
      },
      input,
    );
    const generated = await this.enrichGeneratedStylePayload({
      sourceType: "from_book_analysis",
      preferredCategory: null,
      llmInput: input,
      core: generatedCore,
      fallbackName: input.name,
    });
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
    const generatedCore = await this.generateStructuredStyleFromBrief(
      {
        brief: input.brief,
        name: input.name?.trim() || undefined,
        category: input.category?.trim() || undefined,
      },
      input,
    );
    const generated = await this.enrichGeneratedStylePayload({
      sourceType: "from_brief",
      preferredCategory: input.category?.trim() || null,
      llmInput: input,
      core: generatedCore,
      fallbackName: input.name?.trim() || generatedCore.name?.trim() || "AI 生成写法",
    });
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
  ): Promise<GeneratedStyleCorePayload> {
    const result = await runStructuredPrompt({
      asset: styleProfileFromBookAnalysisPrompt,
      promptInput,
      options: {
        provider: llmInput.provider ?? "deepseek",
        model: llmInput.model,
        temperature: llmInput.temperature ?? 0.5,
        timeoutMs: llmInput.timeoutMs,
        signal: llmInput.signal,
      },
    });
    return this.normalizeGeneratedStyleCorePayload(result.output, promptInput.name);
  }

  private async generateStructuredStyleFromBrief(
    promptInput: {
      brief: string;
      name?: string;
      category?: string;
    },
    llmInput: LlmInput,
  ): Promise<GeneratedStyleCorePayload> {
    const result = await runStructuredPrompt({
      asset: styleProfileFromBriefPrompt,
      promptInput,
      options: {
        provider: llmInput.provider ?? "deepseek",
        model: llmInput.model,
        temperature: llmInput.temperature ?? 0.6,
        timeoutMs: llmInput.timeoutMs,
        signal: llmInput.signal,
      },
    });
    return this.normalizeGeneratedStyleCorePayload(
      result.output,
      promptInput.name?.trim() || "AI 生成写法",
    );
  }

  private async generateStructuredExtractionCore(input: {
    name: string;
    sourceText: string;
    category?: string;
  } & LlmInput): Promise<unknown> {
    logStyleExtractionRuntimeEvent("extract_start", {
      name: input.name,
      category: input.category ?? null,
      provider: input.provider ?? "deepseek",
      model: input.model ?? null,
      temperature: input.temperature ?? 0.5,
      maxTokens: STYLE_EXTRACTION_MAX_TOKENS,
      timeoutMs: input.timeoutMs ?? null,
      sourceTextChars: input.sourceText.length,
    });
    const initialStartedAt = Date.now();
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
        maxTokens: STYLE_EXTRACTION_MAX_TOKENS,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      },
    });
    const initialFeatureCount = countExtractionFeatures(initialResult.output);
    const initialHasUsableFeatures = this.hasUsableExtractionFeatures(initialResult.output);
    logStyleExtractionRuntimeEvent("extract_initial_result", {
      name: input.name,
      latencyMs: Date.now() - initialStartedAt,
      featureCount: initialFeatureCount,
      hasUsableFeatures: initialHasUsableFeatures,
    });
    if (initialHasUsableFeatures) {
      return initialResult.output;
    }

    logStyleExtractionRuntimeEvent("extract_retry_for_features", {
      name: input.name,
      reason: "empty_or_unusable_features",
    });
    const retryStartedAt = Date.now();
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
        maxTokens: STYLE_EXTRACTION_MAX_TOKENS,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      },
    });
    logStyleExtractionRuntimeEvent("extract_retry_result", {
      name: input.name,
      latencyMs: Date.now() - retryStartedAt,
      featureCount: countExtractionFeatures(retriedResult.output),
      hasUsableFeatures: this.hasUsableExtractionFeatures(retriedResult.output),
    });
    return retriedResult.output;
  }

  private async enrichExtractionDraft(
    coreDraft: StyleExtractionDraft,
    llmInput: {
      category?: string;
    } & LlmInput,
  ): Promise<StyleExtractionDraft> {
    const summaryInput: StyleCreationCoreDraft = {
      name: coreDraft.name,
      description: coreDraft.description,
      summary: coreDraft.summary,
      analysisMarkdown: coreDraft.analysisMarkdown,
      features: coreDraft.features,
    };
    const metadataStartedAt = Date.now();
    const antiAiStartedAt = Date.now();
    const [metadataResult, antiAiResult] = await Promise.allSettled([
      this.generateStyleMetadata({
        name: coreDraft.name,
        sourceType: "from_text",
        preferredCategory: llmInput.category ?? coreDraft.category ?? undefined,
        coreDraft: summaryInput,
        llmInput,
      }),
      this.selectAntiAiRuleKeys({
        name: coreDraft.name,
        summary: coreDraft.summary,
        coreDraft: summaryInput,
        llmInput,
      }),
    ]);

    const metadata = metadataResult.status === "fulfilled"
      ? metadataResult.value
      : normalizeStyleMetadataDraft({}, llmInput.category ?? coreDraft.category ?? null);
    if (metadataResult.status === "fulfilled") {
      logStyleExtractionRuntimeEvent("extract_metadata_result", {
        name: coreDraft.name,
        latencyMs: Date.now() - metadataStartedAt,
        category: metadata.category ?? null,
        tagsCount: metadata.tags.length,
        genreCount: metadata.applicableGenres.length,
      });
    } else {
      console.warn("[style.profile.metadata] fallback_to_empty_metadata", {
        name: coreDraft.name,
        error: metadataResult.reason instanceof Error ? metadataResult.reason.message : String(metadataResult.reason),
      });
    }

    const antiAiRuleKeys = antiAiResult.status === "fulfilled"
      ? antiAiResult.value
      : [];
    if (antiAiResult.status === "fulfilled") {
      logStyleExtractionRuntimeEvent("extract_anti_ai_result", {
        name: coreDraft.name,
        latencyMs: Date.now() - antiAiStartedAt,
        antiAiRuleCount: antiAiRuleKeys.length,
      });
    } else {
      console.warn("[style.profile.anti_ai] fallback_to_empty_selection", {
        name: coreDraft.name,
        error: antiAiResult.reason instanceof Error ? antiAiResult.reason.message : String(antiAiResult.reason),
      });
    }

    return {
      ...coreDraft,
      category: metadata.category ?? coreDraft.category ?? (llmInput.category?.trim() || null),
      tags: metadata.tags,
      applicableGenres: metadata.applicableGenres,
      antiAiRuleKeys,
    };
  }

  private async enrichGeneratedStylePayload(input: {
    sourceType: "from_brief" | "from_book_analysis";
    preferredCategory?: string | null;
    llmInput: LlmInput;
    core: GeneratedStyleCorePayload;
    fallbackName: string;
  }): Promise<GeneratedStylePayload> {
    const name = input.core.name?.trim() || input.fallbackName;
    const summaryInput = buildGeneratedCoreDraftSummary({
      name,
      description: input.core.description,
      analysisMarkdown: input.core.analysisMarkdown,
      narrativeRules: input.core.narrativeRules,
      characterRules: input.core.characterRules,
      languageRules: input.core.languageRules,
      rhythmRules: input.core.rhythmRules,
    });
    const [metadataResult, antiAiResult] = await Promise.allSettled([
      this.generateStyleMetadata({
        name,
        sourceType: input.sourceType,
        preferredCategory: input.preferredCategory ?? undefined,
        coreDraft: summaryInput,
        llmInput: input.llmInput,
      }),
      this.selectAntiAiRuleKeys({
        name,
        summary: input.core.description ?? undefined,
        coreDraft: summaryInput,
        llmInput: input.llmInput,
      }),
    ]);

    if (metadataResult.status === "rejected") {
      console.warn("[style.profile.metadata] fallback_to_empty_metadata", {
        name,
        error: metadataResult.reason instanceof Error ? metadataResult.reason.message : String(metadataResult.reason),
      });
    }
    if (antiAiResult.status === "rejected") {
      console.warn("[style.profile.anti_ai] fallback_to_empty_selection", {
        name,
        error: antiAiResult.reason instanceof Error ? antiAiResult.reason.message : String(antiAiResult.reason),
      });
    }

    const metadata = metadataResult.status === "fulfilled"
      ? metadataResult.value
      : normalizeStyleMetadataDraft({}, input.preferredCategory ?? null);
    const antiAiRuleKeys = antiAiResult.status === "fulfilled" ? antiAiResult.value : [];

    return {
      ...input.core,
      name,
      category: metadata.category ?? input.preferredCategory ?? null,
      tags: metadata.tags,
      applicableGenres: metadata.applicableGenres,
      antiAiRuleKeys,
    };
  }

  private async generateStyleMetadata(input: {
    name: string;
    sourceType: "from_text" | "from_brief" | "from_book_analysis";
    preferredCategory?: string;
    coreDraft: StyleCreationCoreDraft;
    llmInput: LlmInput;
  }) {
    const result = await runStructuredPrompt({
      asset: styleProfileMetadataPrompt,
      promptInput: {
        name: input.name,
        sourceType: input.sourceType,
        preferredCategory: input.preferredCategory,
        styleDigest: buildStyleMetadataDigest(input.coreDraft),
      },
      options: {
        provider: input.llmInput.provider ?? "deepseek",
        model: input.llmInput.model,
        temperature: 0.2,
        maxTokens: STYLE_METADATA_MAX_TOKENS,
        timeoutMs: input.llmInput.timeoutMs,
        signal: input.llmInput.signal,
      },
    });
    return normalizeStyleMetadataDraft(result.output, input.preferredCategory ?? null);
  }

  private async selectAntiAiRuleKeys(input: {
    name: string;
    summary?: string;
    coreDraft: StyleCreationCoreDraft;
    llmInput: LlmInput;
  }): Promise<string[]> {
    const antiAiRules = await this.listEnabledAntiAiRules();
    if (antiAiRules.length === 0) {
      return [];
    }

    const result = await runStructuredPrompt({
      asset: styleProfileAntiAiSelectionPrompt,
      promptInput: {
        name: input.name,
        summary: input.summary,
        styleDigest: buildStyleMetadataDigest(input.coreDraft),
        riskDigest: buildStyleAntiAiRiskDigest(input.coreDraft),
        catalogText: buildAntiAiCatalogText(antiAiRules),
        maxRuleCount: 4,
      },
      options: {
        provider: input.llmInput.provider ?? "deepseek",
        model: input.llmInput.model,
        temperature: 0.2,
        maxTokens: STYLE_ANTI_AI_SELECTION_MAX_TOKENS,
        timeoutMs: input.llmInput.timeoutMs,
        signal: input.llmInput.signal,
      },
    });

    const rawKeys = isRecord(result.output) && Array.isArray(result.output.antiAiRuleKeys)
      ? result.output.antiAiRuleKeys.filter((item): item is string => typeof item === "string")
      : [];
    const normalized = normalizeStyleAntiAiSelectionDraft(
      result.output,
      antiAiRules.map((rule) => rule.key),
    );
    const droppedKeys = rawKeys.filter((key) => !normalized.antiAiRuleKeys.includes(key));
    if (droppedKeys.length > 0) {
      console.warn("[style.profile.anti_ai] dropped_invalid_rule_keys", {
        name: input.name,
        droppedKeys,
      });
    }
    return normalized.antiAiRuleKeys;
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
      extractionAntiAiRuleKeys: input.generated.antiAiRuleKeys ?? [],
      analysisMarkdown: input.generated.analysisMarkdown ?? undefined,
      narrativeRules: input.generated.narrativeRules,
      characterRules: input.generated.characterRules,
      languageRules: input.generated.languageRules,
      rhythmRules: input.generated.rhythmRules,
      antiAiRuleIds,
    });
  }

  private async listEnabledAntiAiRules() {
    const rows = await prisma.antiAiRule.findMany({
      where: { enabled: true },
      orderBy: [{ type: "asc" }, { severity: "desc" }, { name: "asc" }],
    });
    return rows.map((row) => mapAntiAiRuleRow(row));
  }

  private async resolveAntiAiRuleIds(ruleKeys: string[]): Promise<string[]> {
    if (ruleKeys.length === 0) {
      return [];
    }
    const normalizedRuleKeys = Array.from(new Set(ruleKeys.map((key) => key.trim()).filter(Boolean)));
    const antiRules = await prisma.antiAiRule.findMany({
      where: { key: { in: normalizedRuleKeys } },
    });
    const matchedKeySet = new Set(antiRules.map((rule) => rule.key));
    const droppedKeys = normalizedRuleKeys.filter((key) => !matchedKeySet.has(key));
    if (droppedKeys.length > 0) {
      console.warn("[style.profile.anti_ai] unresolved_rule_keys", {
        droppedKeys,
      });
    }
    return antiRules.map((rule) => rule.id);
  }

  private normalizeGeneratedStyleCorePayload(
    value: GeneratedStyleCorePayload,
    fallbackName: string,
  ): GeneratedStyleCorePayload {
    return {
      name: value.name?.trim() || fallbackName,
      description: normalizeOptionalText(value.description),
      analysisMarkdown: normalizeOptionalText(value.analysisMarkdown),
      narrativeRules: normalizeRuleRecord(value.narrativeRules),
      characterRules: normalizeRuleRecord(value.characterRules),
      languageRules: normalizeRuleRecord(value.languageRules),
      rhythmRules: normalizeRuleRecord(value.rhythmRules),
    };
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
