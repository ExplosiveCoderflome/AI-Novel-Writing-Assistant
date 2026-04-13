import type { World as PrismaWorld } from "@prisma/client";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { WorldLayerKey } from "@ai-novel/shared/types/world";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  worldLayerGenerationPrompt,
  worldLayerLocalizationPrompt,
} from "../../prompting/prompts/world/world.prompts";
import { ragServices } from "../rag";
import { buildWorldBlueprintPromptBlock } from "./worldGenerationBlueprint";
import { getTemplateByKey, LAYER_FIELD_MAP } from "./worldTemplates";

type WorldTextField =
  | "description"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions";

function needsChineseTextTranslation(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  const latinCount = (normalized.match(/[A-Za-z]/g) ?? []).length;
  if (latinCount < 12) {
    return false;
  }
  const cjkCount = (normalized.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  return cjkCount === 0 || cjkCount * 2 < latinCount;
}

function normalizeGeneratedLayerFieldValue(raw: unknown): string {
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    if (raw.every((item) => typeof item === "string")) {
      return raw.map((item) => item.trim()).filter(Boolean).join("、");
    }
    return JSON.stringify(raw, null, 2);
  }
  if (raw && typeof raw === "object") {
    return JSON.stringify(raw, null, 2);
  }
  return "";
}

async function localizeLayerGenerationToChineseIfNeeded(
  options: { provider?: LLMProvider; model?: string },
  layerKey: WorldLayerKey,
  layerFields: WorldTextField[],
  generated: Partial<Record<WorldTextField, string>>,
): Promise<Partial<Record<WorldTextField, string>>> {
  const sourcePayload = layerFields.reduce((acc, field) => {
    const value = generated[field]?.trim();
    if (value) {
      acc[field] = value;
    }
    return acc;
  }, {} as Record<string, string>);

  if (Object.keys(sourcePayload).length === 0) {
    return generated;
  }

  const hasEnglishHeavyField = Object.values(sourcePayload).some((value) => needsChineseTextTranslation(value));
  if (!hasEnglishHeavyField) {
    return generated;
  }

  try {
    const result = await runStructuredPrompt({
      asset: worldLayerLocalizationPrompt,
      promptInput: {
        layerKey,
        layerFields,
        sourcePayloadJson: JSON.stringify(sourcePayload),
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: 0.2,
      },
    });
    const parsed = result.output as Partial<Record<WorldTextField, unknown>>;
    const localized = { ...generated };
    for (const field of layerFields) {
      const value = normalizeGeneratedLayerFieldValue(parsed[field]);
      if (value) {
        localized[field] = value;
      }
    }
    return localized;
  } catch {
    return generated;
  }
}

export async function buildWorldLayerGeneration(
  options: { provider?: LLMProvider; model?: string; temperature?: number },
  world: PrismaWorld,
  layerKey: WorldLayerKey,
): Promise<Partial<Record<WorldTextField, string>>> {
  const layerTemplate = getTemplateByKey(world.templateKey);
  const targetFields = LAYER_FIELD_MAP[layerKey];
  const blueprintPromptBlock = buildWorldBlueprintPromptBlock(world);
  let layerRagContext = "";
  try {
    layerRagContext = await ragServices.hybridRetrievalService.buildContextBlock(
      `世界分层生成 ${layerKey}\n${world.name}\n${world.description ?? ""}`,
      {
        worldId: world.id,
        ownerTypes: ["world", "world_library_item"],
        finalTopK: 6,
      },
    );
  } catch {
    layerRagContext = "";
  }

  const layeredResult = await runStructuredPrompt({
    asset: worldLayerGenerationPrompt,
    promptInput: {
      layerKey,
      targetFields,
      worldName: world.name,
      worldType: world.worldType ?? layerTemplate.worldType,
      templateName: layerTemplate.name,
      templateDescription: layerTemplate.description,
      classicElements: layerTemplate.classicElements,
      pitfalls: layerTemplate.pitfalls,
      axioms: world.axioms ?? "none",
      summary: world.description ?? "none",
      blueprintPromptBlock,
      existingJson: JSON.stringify({
        background: world.background,
        geography: world.geography,
        magicSystem: world.magicSystem,
        technology: world.technology,
        races: world.races,
        politics: world.politics,
        cultures: world.cultures,
        religions: world.religions,
        history: world.history,
        conflicts: world.conflicts,
      }),
      ragContext: layerRagContext || "none",
    },
    options: {
      provider: options.provider ?? "deepseek",
      model: options.model,
      temperature: options.temperature ?? 0.7,
    },
  });

  const fallbackField = targetFields[0];
  let layeredGenerated: Partial<Record<WorldTextField, string>> = {};

  const parsedLayer = layeredResult.output as Partial<Record<WorldTextField, unknown>>;
  for (const field of targetFields) {
    const normalized = normalizeGeneratedLayerFieldValue(parsedLayer[field]);
    if (normalized) {
      layeredGenerated[field] = normalized;
    }
  }
  if (Object.keys(layeredGenerated).length === 0) {
    const normalizedObject = normalizeGeneratedLayerFieldValue(parsedLayer);
    if (normalizedObject) {
      layeredGenerated[fallbackField] = normalizedObject;
    }
  }

  if (Object.keys(layeredGenerated).length === 0) {
    throw new Error(`世界分层生成未返回可用的 ${layerKey} 内容。`);
  }

  return localizeLayerGenerationToChineseIfNeeded(options, layerKey, targetFields, layeredGenerated);
}
