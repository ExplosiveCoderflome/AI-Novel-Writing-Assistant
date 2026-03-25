import type { World as PrismaWorld } from "@prisma/client";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { WorldLayerKey } from "@ai-novel/shared/types/world";
import { getLLM } from "../../llm/factory";
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

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("Invalid JSON object.");
  }
  return text.slice(first, last + 1);
}

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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
  llm: Awaited<ReturnType<typeof getLLM>>,
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
    const result = await llm.invoke([
      new SystemMessage(
        `你是文本本地化助手。将输入 JSON 对象中所有字段值改写为简体中文：
- 保持字段名不变，不新增字段，不删除字段；
- 保留原设定语义与专有名词含义；
- 输出仅为 JSON 对象。`,
      ),
      new HumanMessage(
        `layer=${layerKey}
fields=${layerFields.join(",")}
input=${JSON.stringify(sourcePayload)}`,
      ),
    ]);
    const parsed = safeParseJSON<Partial<Record<WorldTextField, unknown>>>(
      extractJSONObject(String(result.content)),
      {},
    );
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
  llm: Awaited<ReturnType<typeof getLLM>>,
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

  const layeredResult = await llm.invoke([
    new SystemMessage(
      `你是世界观分层构建器，只负责生成 layer=${layerKey} 对应字段。
必须输出 JSON 对象，且字段只能来自：${targetFields.join(", ")}。
要求：
1. 必须遵守世界公理、模板约束、用户前置蓝图选择和既有已生成内容。
2. 不要写空泛摘要，要写能直接用于小说创作的具体设定。
3. 当前层必须与前面层形成因果或结构关联，而不是孤立描述。
4. 所有字段值必须使用简体中文。
5. 只输出 JSON，不要输出解释。`,
    ),
    new HumanMessage(
      `name=${world.name}
worldType=${world.worldType ?? layerTemplate.worldType}
template=${layerTemplate.name}
templateDescription=${layerTemplate.description}
classicElements=${layerTemplate.classicElements.join(" | ") || "none"}
pitfalls=${layerTemplate.pitfalls.join(" | ") || "none"}
axioms=${world.axioms ?? "none"}
summary=${world.description ?? "none"}
blueprint=
${blueprintPromptBlock}
existing=${JSON.stringify({
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
      })}
ragContext=${layerRagContext || "none"}`,
    ),
  ]);

  const layeredText = String(layeredResult.content);
  const fallbackField = targetFields[0];
  let layeredGenerated: Partial<Record<WorldTextField, string>> = {};

  try {
    const parsedLayer = safeParseJSON<Partial<Record<WorldTextField, unknown>>>(
      extractJSONObject(layeredText),
      {},
    );
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
  } catch {
    layeredGenerated = { [fallbackField]: layeredText.trim() };
  }

  if (Object.keys(layeredGenerated).length === 0) {
    layeredGenerated = { [fallbackField]: layeredText.trim() };
  }

  return localizeLayerGenerationToChineseIfNeeded(llm, layerKey, targetFields, layeredGenerated);
}
