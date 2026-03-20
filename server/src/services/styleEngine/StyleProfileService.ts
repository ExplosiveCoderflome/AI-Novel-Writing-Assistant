import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StyleProfile, StyleRuleSet, StyleSourceType, StyleTemplate } from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import { mapStyleProfileRow, mapStyleTemplateRow, extractJsonObject, serializeJson, toLlmText } from "./helpers";

interface ManualProfileInput {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  applicableGenres?: string[];
  sourceType?: StyleSourceType;
  sourceRefId?: string;
  sourceContent?: string;
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
        analysisMarkdown: input.analysisMarkdown,
        narrativeRulesJson: input.narrativeRules ? serializeJson(input.narrativeRules) : undefined,
        characterRulesJson: input.characterRules ? serializeJson(input.characterRules) : undefined,
        languageRulesJson: input.languageRules ? serializeJson(input.languageRules) : undefined,
        rhythmRulesJson: input.rhythmRules ? serializeJson(input.rhythmRules) : undefined,
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
    await ensureStyleEngineSeedData();
    const generated = await this.generateStructuredStyle(
      `请从下面文本中提炼一套可执行写法资产。输出 JSON，字段包括：
name, description, category, tags, applicableGenres, analysisMarkdown,
narrativeRules, characterRules, languageRules, rhythmRules, antiAiRuleKeys。
要求：
1. 规则必须是结构化字段，不要只返回长段自然语言。
2. antiAiRuleKeys 只能从系统内置规则中推荐最相关的 3-6 个 key。
3. 不要输出解释文字，只输出 JSON 对象。`,
      `写法名称：${input.name}
建议分类：${input.category ?? "未指定"}

原文：
${input.sourceText}`,
      input,
    );
    return this.persistGeneratedProfile({
      inputName: input.name,
      sourceType: "from_text",
      sourceContent: input.sourceText,
      generated,
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
    const llm = await getLLM(llmInput.provider ?? "deepseek", {
      model: llmInput.model,
      temperature: llmInput.temperature ?? 0.5,
    });
    const result = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    return extractJsonObject<GeneratedStylePayload>(toLlmText(result.content));
  }

  private async persistGeneratedProfile(input: {
    inputName: string;
    sourceType: StyleSourceType;
    sourceRefId?: string;
    sourceContent: string;
    generated: GeneratedStylePayload;
  }): Promise<StyleProfile> {
    const ruleKeys = input.generated.antiAiRuleKeys ?? [];
    const antiRules = ruleKeys.length > 0
      ? await prisma.antiAiRule.findMany({ where: { key: { in: ruleKeys } } })
      : [];
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
      antiAiRuleIds: antiRules.map((rule) => rule.id),
    });
  }
}
