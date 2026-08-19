import { prisma } from "../../db/prisma";
import { derivePromptContextRequirements } from "../context/promptContextResolution";
import type { PromptAsset } from "../core/promptTypes";
import { findRegisteredPromptAssetById } from "../registry";
import type { PromptSlotDef } from "../slots/slotTypes";
import {
  assertPromptTemplateIsSavable,
  extractPromptTemplateContextRefs,
  hasBlockingPromptTemplateDiagnostics,
} from "./templateCompiler";
import {
  getOfficialPromptTemplate,
  getOfficialPromptTemplateContextRefs,
  getOfficialPromptTemplateVersion,
  hashPromptTemplate,
} from "./officialTemplates";
import type {
  PromptTemplateContextRefs,
  PromptTemplateJson,
  PromptTemplateOverrideMode,
  PromptTemplateOverrideView,
  PromptTemplateRestoreInput,
  PromptTemplateSaveInput,
  PromptTemplateVersionActionInput,
  PromptTemplateVersionView,
} from "./templateTypes";
import {
  ADVANCED_TEMPLATE_PROMPT_ID,
  ADVANCED_TEMPLATE_SCOPE,
} from "./templateTypes";

type UnknownPromptAsset = PromptAsset<unknown, unknown, unknown>;

type PromptTemplateOverrideRecord = {
  id: string;
  scope: string;
  novelId: string;
  promptId: string;
  basePromptVersion: string;
  mode: string;
  activeVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PromptTemplateVersionRecord = {
  id: string;
  overrideId: string;
  versionNo: number;
  templateJson: string;
  contextRefsJson: string;
  compiledHash: string;
  notes: string | null;
  createdAt: Date;
};

function isMissingTableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    (error.message.includes("PromptTemplateOverride") || error.message.includes("PromptTemplateVersion"))
    && (error.message.includes("does not exist")
      || error.message.includes("no such table")
      || error.message.includes("Unknown table"))
  );
}

function parseTemplateJson(raw: string): PromptTemplateJson {
  const parsed = JSON.parse(raw);
  return parsed as PromptTemplateJson;
}

function parseContextRefs(raw: string): PromptTemplateContextRefs {
  try {
    const parsed = JSON.parse(raw);
    return {
      context: Array.isArray(parsed?.context) ? parsed.context : [],
      input: Array.isArray(parsed?.input) ? parsed.input : [],
      slot: Array.isArray(parsed?.slot) ? parsed.slot : [],
    };
  } catch {
    return { context: [], input: [], slot: [] };
  }
}

function toVersionView(record: PromptTemplateVersionRecord): PromptTemplateVersionView {
  return {
    id: record.id,
    versionNo: record.versionNo,
    template: parseTemplateJson(record.templateJson),
    contextRefs: parseContextRefs(record.contextRefsJson),
    compiledHash: record.compiledHash,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
  };
}

function toOfficialView(input: {
  promptId: string;
  novelId: string;
  asset: UnknownPromptAsset;
  versions?: PromptTemplateVersionView[];
  override?: PromptTemplateOverrideRecord | null;
  activeVersion?: PromptTemplateVersionView | null;
}): PromptTemplateOverrideView {
  const officialTemplate = getOfficialPromptTemplate(input.promptId);
  const officialContextRefs = getOfficialPromptTemplateContextRefs(input.promptId);
  if (!officialTemplate || !officialContextRefs) {
    throw new Error(`提示词不支持高级模板：${input.promptId}`);
  }
  return {
    promptId: input.promptId,
    novelId: input.novelId,
    scope: ADVANCED_TEMPLATE_SCOPE,
    basePromptVersion: input.override?.basePromptVersion ?? input.asset.version,
    mode: (input.override?.mode === "custom" ? "custom" : "official") as PromptTemplateOverrideMode,
    activeVersionId: input.override?.activeVersionId ?? null,
    activeVersion: input.activeVersion ?? null,
    versions: input.versions ?? [],
    officialTemplate,
    officialContextRefs,
    officialCompiledHash: hashPromptTemplate(officialTemplate),
  };
}

function assertAdvancedTemplatePrompt(promptId: string): UnknownPromptAsset {
  if (promptId !== ADVANCED_TEMPLATE_PROMPT_ID) {
    throw new Error("第一阶段仅支持正文写作提示词的高级模板。");
  }
  const asset = findRegisteredPromptAssetById(promptId);
  if (!asset) {
    throw new Error(`提示词未注册：${promptId}`);
  }
  if (asset.id !== ADVANCED_TEMPLATE_PROMPT_ID || asset.mode !== "text") {
    throw new Error("该提示词不支持高级模板。");
  }
  return asset;
}

function allowedContextGroups(asset: UnknownPromptAsset): string[] {
  return [...new Set(derivePromptContextRequirements(asset).map((requirement) => requirement.group))].sort();
}

function formatDiagnosticsError(prefix: string, diagnostics: ReturnType<typeof assertPromptTemplateIsSavable>): Error {
  const details = [
    ...diagnostics.invalidMessages,
    diagnostics.unknownTokens.length > 0 ? `未知 token：${diagnostics.unknownTokens.join("、")}` : "",
  ].filter(Boolean);
  return new Error(`${prefix}${details.length > 0 ? `：${details.join("；")}` : ""}`);
}

export class PromptTemplateOverrideService {
  async get(input: { promptId: string; novelId: string }): Promise<PromptTemplateOverrideView> {
    const asset = assertAdvancedTemplatePrompt(input.promptId);
    try {
      const override = await prisma.promptTemplateOverride.findUnique({
        where: {
          scope_novelId_promptId: {
            scope: ADVANCED_TEMPLATE_SCOPE,
            novelId: input.novelId,
            promptId: input.promptId,
          },
        },
      });
      if (!override) {
        return toOfficialView({ promptId: input.promptId, novelId: input.novelId, asset });
      }
      const versions = await prisma.promptTemplateVersion.findMany({
        where: { overrideId: override.id },
        orderBy: [{ versionNo: "desc" }],
      });
      const versionViews = versions.map((version) => toVersionView(version as PromptTemplateVersionRecord));
      const activeVersion = override.activeVersionId
        ? versionViews.find((version) => version.id === override.activeVersionId) ?? null
        : null;
      return toOfficialView({
        promptId: input.promptId,
        novelId: input.novelId,
        asset,
        override: override as PromptTemplateOverrideRecord,
        versions: versionViews,
        activeVersion,
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return toOfficialView({ promptId: input.promptId, novelId: input.novelId, asset });
      }
      throw error;
    }
  }

  async save(input: PromptTemplateSaveInput): Promise<PromptTemplateOverrideView> {
    const asset = assertAdvancedTemplatePrompt(input.promptId);
    if (!input.novelId) {
      throw new Error("高级模板必须绑定到具体小说。");
    }
    const diagnostics = assertPromptTemplateIsSavable({
      template: input.template,
      allowedContextGroups: allowedContextGroups(asset),
      slotDefs: asset.slots ?? [],
    });
    if (diagnostics.invalidMessages.length > 0 || diagnostics.unknownTokens.length > 0) {
      throw formatDiagnosticsError("高级模板不能保存", diagnostics);
    }
    const contextRefs = extractPromptTemplateContextRefs(input.template);
    const compiledHash = hashPromptTemplate(input.template);

    try {
      const override = await prisma.promptTemplateOverride.upsert({
        where: {
          scope_novelId_promptId: {
            scope: ADVANCED_TEMPLATE_SCOPE,
            novelId: input.novelId,
            promptId: input.promptId,
          },
        },
        create: {
          scope: ADVANCED_TEMPLATE_SCOPE,
          novelId: input.novelId,
          promptId: input.promptId,
          basePromptVersion: asset.version,
          mode: "official",
        },
        update: {
          basePromptVersion: asset.version,
        },
      });
      const latest = await prisma.promptTemplateVersion.findFirst({
        where: { overrideId: override.id },
        orderBy: [{ versionNo: "desc" }],
      });
      const version = await prisma.promptTemplateVersion.create({
        data: {
          overrideId: override.id,
          versionNo: (latest?.versionNo ?? 0) + 1,
          templateJson: JSON.stringify(input.template),
          contextRefsJson: JSON.stringify(contextRefs),
          compiledHash,
          notes: input.notes?.trim() || null,
        },
      });
      await prisma.promptTemplateOverride.update({
        where: { id: override.id },
        data: {
          mode: "custom",
          activeVersionId: version.id,
          basePromptVersion: asset.version,
        },
      });
      return this.get({ promptId: input.promptId, novelId: input.novelId });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new Error("数据库表尚未就绪，请先运行数据库迁移。");
      }
      throw error;
    }
  }

  async activateVersion(input: PromptTemplateVersionActionInput): Promise<PromptTemplateOverrideView> {
    const asset = assertAdvancedTemplatePrompt(input.promptId);
    try {
      const override = await prisma.promptTemplateOverride.findUnique({
        where: {
          scope_novelId_promptId: {
            scope: ADVANCED_TEMPLATE_SCOPE,
            novelId: input.novelId,
            promptId: input.promptId,
          },
        },
      });
      if (!override) {
        throw new Error("没有可回滚的高级模板版本。");
      }
      const version = await prisma.promptTemplateVersion.findFirst({
        where: { id: input.versionId, overrideId: override.id },
      });
      if (!version) {
        throw new Error("高级模板版本不存在。");
      }
      const diagnostics = assertPromptTemplateIsSavable({
        template: parseTemplateJson(version.templateJson),
        allowedContextGroups: allowedContextGroups(asset),
        slotDefs: asset.slots ?? [],
      });
      if (hasBlockingPromptTemplateDiagnostics(diagnostics)) {
        throw formatDiagnosticsError("该历史版本不能启用", diagnostics);
      }
      await prisma.promptTemplateOverride.update({
        where: { id: override.id },
        data: {
          mode: "custom",
          activeVersionId: version.id,
          basePromptVersion: asset.version,
        },
      });
      return this.get({ promptId: input.promptId, novelId: input.novelId });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new Error("数据库表尚未就绪，请先运行数据库迁移。");
      }
      throw error;
    }
  }

  async restoreOfficial(input: PromptTemplateRestoreInput): Promise<PromptTemplateOverrideView> {
    const asset = assertAdvancedTemplatePrompt(input.promptId);
    try {
      const override = await prisma.promptTemplateOverride.findUnique({
        where: {
          scope_novelId_promptId: {
            scope: ADVANCED_TEMPLATE_SCOPE,
            novelId: input.novelId,
            promptId: input.promptId,
          },
        },
      });
      if (override) {
        await prisma.promptTemplateOverride.update({
          where: { id: override.id },
          data: {
            mode: "official",
            activeVersionId: null,
            basePromptVersion: asset.version,
          },
        });
      }
      return this.get({ promptId: input.promptId, novelId: input.novelId });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new Error("数据库表尚未就绪，请先运行数据库迁移。");
      }
      throw error;
    }
  }

  async getActiveCustomTemplate(input: {
    promptId: string;
    novelId?: string;
  }): Promise<{
    template: PromptTemplateJson;
    versionNo: number;
    versionId: string;
    basePromptVersion: string;
  } | null> {
    if (input.promptId !== ADVANCED_TEMPLATE_PROMPT_ID || !input.novelId) {
      return null;
    }
    try {
      const override = await prisma.promptTemplateOverride.findUnique({
        where: {
          scope_novelId_promptId: {
            scope: ADVANCED_TEMPLATE_SCOPE,
            novelId: input.novelId,
            promptId: input.promptId,
          },
        },
      });
      if (!override || override.mode !== "custom" || !override.activeVersionId) {
        return null;
      }
      const version = await prisma.promptTemplateVersion.findFirst({
        where: { id: override.activeVersionId, overrideId: override.id },
      });
      if (!version) {
        return null;
      }
      return {
        template: parseTemplateJson(version.templateJson),
        versionNo: version.versionNo,
        versionId: version.id,
        basePromptVersion: override.basePromptVersion,
      };
    } catch (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  getOfficialTemplate(input: { promptId: string }): {
    template: PromptTemplateJson;
    basePromptVersion: string;
    contextRefs: PromptTemplateContextRefs;
    compiledHash: string;
    slotDefs: PromptSlotDef[];
    allowedContextGroups: string[];
  } {
    const asset = assertAdvancedTemplatePrompt(input.promptId);
    const template = getOfficialPromptTemplate(input.promptId);
    const contextRefs = getOfficialPromptTemplateContextRefs(input.promptId);
    const basePromptVersion = getOfficialPromptTemplateVersion(input.promptId);
    if (!template || !contextRefs || !basePromptVersion) {
      throw new Error(`提示词不支持高级模板：${input.promptId}`);
    }
    return {
      template,
      basePromptVersion,
      contextRefs,
      compiledHash: hashPromptTemplate(template),
      slotDefs: asset.slots ?? [],
      allowedContextGroups: allowedContextGroups(asset),
    };
  }
}

export const promptTemplateOverrideService = new PromptTemplateOverrideService();
