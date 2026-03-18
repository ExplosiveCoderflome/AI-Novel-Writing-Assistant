import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { getLLM } from "../../llm/factory";
import type { WorldLayerKey } from "@ai-novel/shared/types/world";
import type {
  WorldOptionRefinementLevel,
  WorldPropertyOption,
} from "@ai-novel/shared/types/worldWizard";

interface GenerateWorldPropertyOptionsInput {
  llm: Awaited<ReturnType<typeof getLLM>>;
  worldType: string;
  templateName: string;
  templateDescription: string;
  classicElements: string[];
  pitfalls: string[];
  conceptSummary: string;
  coreImagery: string[];
  keywords: string[];
  tone: string;
  sourcePrompt: string;
  ragContext?: string;
  refinementLevel?: WorldOptionRefinementLevel;
  optionsCount?: number;
}

const LAYER_ALIASES: Record<string, WorldLayerKey> = {
  foundation: "foundation",
  "基础": "foundation",
  "基础层": "foundation",
  "世界基础": "foundation",
  power: "power",
  "力量": "power",
  "力量层": "power",
  "力量体系": "power",
  "能力体系": "power",
  society: "society",
  "社会": "society",
  "社会层": "society",
  "势力": "society",
  "政治": "society",
  culture: "culture",
  "文化": "culture",
  "文化层": "culture",
  "风俗": "culture",
  history: "history",
  "历史": "history",
  "历史层": "history",
  conflict: "conflict",
  "冲突": "conflict",
  "冲突层": "conflict",
};

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("Missing JSON object.");
  }
  return text.slice(first, last + 1);
}

function extractJSONArray(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("Missing JSON array.");
  }
  return text.slice(first, last + 1);
}

function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeLayer(raw: unknown): WorldLayerKey | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return LAYER_ALIASES[normalized] ?? null;
}

function slugifyWorldOptionId(name: string, targetLayer: WorldLayerKey, index: number): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return slug ? `${targetLayer}-${slug}` : `${targetLayer}-option-${index + 1}`;
}

function resolveDefaultCount(refinementLevel: WorldOptionRefinementLevel): number {
  switch (refinementLevel) {
    case "basic":
      return 5;
    case "detailed":
      return 8;
    default:
      return 6;
  }
}

function clampOptionsCount(value: number): number {
  return Math.max(4, Math.min(8, Math.floor(value)));
}

function normalizeOptions(raw: unknown, limit: number): WorldPropertyOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items = raw
    .map<WorldPropertyOption | null>((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const description = typeof record.description === "string" ? record.description.trim() : "";
      const targetLayer = normalizeLayer(record.targetLayer);
      const reason = typeof record.reason === "string" ? record.reason.trim() : "";

      if (!name || !description || !targetLayer) {
        return null;
      }

      return {
        id: typeof record.id === "string" && record.id.trim()
          ? record.id.trim()
          : slugifyWorldOptionId(name, targetLayer, index),
        name,
        description,
        targetLayer,
        reason: reason || null,
        source: "ai" as const,
        libraryItemId: null,
      };
    })
    .filter((item): item is WorldPropertyOption => Boolean(item));

  return Array.from(new Map(items.map((item) => [item.id, item])).values()).slice(0, limit);
}

function buildPrompt(input: GenerateWorldPropertyOptionsInput, optionsCount: number): string {
  return [
    `世界类型：${input.worldType}`,
    `模板：${input.templateName}`,
    `模板说明：${input.templateDescription}`,
    input.classicElements.length > 0 ? `可参考的经典元素：${input.classicElements.join("、")}` : "",
    input.pitfalls.length > 0 ? `需要避开的常见坑点：${input.pitfalls.join("、")}` : "",
    `世界概念摘要：${input.conceptSummary}`,
    input.coreImagery.length > 0 ? `核心意象：${input.coreImagery.join("、")}` : "",
    input.keywords.length > 0 ? `关键词：${input.keywords.join("、")}` : "",
    input.tone.trim() ? `整体基调：${input.tone.trim()}` : "",
    input.sourcePrompt.trim() ? `用户原始灵感：${input.sourcePrompt.trim()}` : "",
    input.ragContext?.trim() ? `可参考素材：${input.ragContext.trim()}` : "",
    `请生成 ${optionsCount} 个“适合在正式生成世界前先做决定”的关键世界属性选项。`,
    "这些选项需要延续旧版 V2 世界生成器里“先选属性、再补细节”的思路。",
    "要求：",
    "1. 每个属性都必须是具体、可选择、会影响后续世界构建方向的前置决策。",
    "2. 属性之间尽量独立，但组合起来能形成连贯世界。",
    "3. 优先覆盖真正重要的分歧点，而不是世界名称、世界简介这类宽泛项。",
    "4. 属性描述要明确，让用户一眼知道自己在决定什么。",
    "5. 尽量兼顾基础层、力量层、社会层、文化层、历史层、冲突层，不要全部挤在同一层。",
    "6. 可以参考经典网文世界搭建逻辑，但不要陈词滥调，要有辨识度。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRetryPrompt(input: GenerateWorldPropertyOptionsInput, optionsCount: number): string {
  return [
    buildPrompt(input, optionsCount),
    "",
    "请严格返回 JSON，不要添加任何解释。",
    "如果你不确定，也必须先给出结构化候选，而不是省略 options。",
    "输出示例：",
    `{
  "options": [
    {
      "name": "禁忌知识传播方式",
      "description": "决定克苏鲁知识如何扩散、谁能接触以及接触后的代价，会直接影响调查线、疯癫风险和世界恐怖感的建立。",
      "targetLayer": "conflict",
      "reason": "它会直接定义故事的危险来源和信息机制。"
    }
  ]
}`,
  ].join("\n");
}

function parseWorldPropertyOptionsPayload(content: string, optionsCount: number): WorldPropertyOption[] {
  try {
    const parsed = safeParseJSON<{ options?: unknown[] }>(
      extractJSONObject(content),
      {},
    );
    const options = normalizeOptions(parsed.options ?? [], optionsCount);
    if (options.length > 0) {
      return options;
    }
  } catch {
    // fall through to array parsing
  }

  try {
    const parsed = safeParseJSON<unknown[]>(
      extractJSONArray(content),
      [],
    );
    return normalizeOptions(parsed, optionsCount);
  } catch {
    return [];
  }
}

export async function generateWorldPropertyOptions(
  input: GenerateWorldPropertyOptionsInput,
): Promise<WorldPropertyOption[]> {
  const refinementLevel = input.refinementLevel ?? "standard";
  const optionsCount = clampOptionsCount(input.optionsCount ?? resolveDefaultCount(refinementLevel));

  const systemPrompt = `你是小说世界生成器的前置决策规划师。
请根据用户的世界类型、概念卡和参考素材，输出 JSON 对象：
{
  "options": [
    {
      "id": "可选",
      "name": "属性名称",
      "description": "40-90字，说明这个属性决定什么，以及为什么值得在生成前就做选择",
      "targetLayer": "foundation|power|society|culture|history|conflict",
      "reason": "一句话说明它为什么值得优先决策"
    }
  ]
}
规则：
1. 只输出 JSON 对象，不要输出解释。
2. options 数量必须与要求数量一致。
3. 所有文本必须使用简体中文。
4. targetLayer 只能是 foundation、power、society、culture、history、conflict。
5. 不要生成“世界名称”“世界简介”这类过于宽泛的伪选项，要生成真正可选的设定方向。`;

  const attemptPrompts = [
    buildPrompt(input, optionsCount),
    buildRetryPrompt(input, optionsCount),
  ];

  for (const prompt of attemptPrompts) {
    const result = await input.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ]);
    const options = parseWorldPropertyOptionsPayload(String(result.content), optionsCount);
    if (options.length >= Math.min(4, optionsCount)) {
      return options;
    }
  }

  throw new Error("世界属性选项生成失败，模型未返回足够的有效结构。");
}
