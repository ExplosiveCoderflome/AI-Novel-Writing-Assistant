import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { getLLM } from "../../llm/factory";
import type { WorldLayerKey } from "@ai-novel/shared/types/world";
import type {
  WorldPropertyChoice,
  WorldOptionRefinementLevel,
  WorldPropertyOption,
  WorldReferenceAnchor,
  WorldReferenceMode,
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
  referenceMode?: WorldReferenceMode | null;
  referenceAnchors?: WorldReferenceAnchor[];
  preserveElements?: string[];
  allowedChanges?: string[];
  forbiddenElements?: string[];
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

function normalizeChoices(raw: unknown, optionName: string, targetLayer: WorldLayerKey): WorldPropertyChoice[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items = raw
    .map<WorldPropertyChoice | null>((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const summary = typeof record.summary === "string" ? record.summary.trim() : "";
      const id = typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : slugifyWorldOptionId(`${optionName}-${label || index + 1}`, targetLayer, index);
      if (!label || !summary) {
        return null;
      }
      return { id, label, summary };
    })
    .filter((item): item is WorldPropertyChoice => Boolean(item));

  return Array.from(new Map(items.map((item) => [item.id, item])).values()).slice(0, 4);
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
      const choices = targetLayer ? normalizeChoices(record.choices, name, targetLayer) : [];

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
        choices,
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

function buildReferenceModeLabel(mode: WorldReferenceMode | null | undefined): string {
  switch (mode) {
    case "extract_base":
      return "提取原作世界基底";
    case "tone_rebuild":
      return "借用原作气质与结构重建";
    case "adapt_world":
    default:
      return "基于原作做架空改造";
  }
}

function buildReferencePrompt(input: GenerateWorldPropertyOptionsInput, optionsCount: number): string {
  return [
    `参考方式：${buildReferenceModeLabel(input.referenceMode)}`,
    input.referenceAnchors && input.referenceAnchors.length > 0
      ? `原作世界锚点：\n${input.referenceAnchors.map((item) => `- ${item.label}：${item.content}`).join("\n")}`
      : "",
    input.preserveElements && input.preserveElements.length > 0
      ? `必须保留：${input.preserveElements.join("、")}`
      : "",
    input.allowedChanges && input.allowedChanges.length > 0
      ? `允许改造：${input.allowedChanges.join("、")}`
      : "",
    input.forbiddenElements && input.forbiddenElements.length > 0
      ? `禁止偏离：${input.forbiddenElements.join("、")}`
      : "",
    `请生成 ${optionsCount} 个“架空改造前必须先决定”的关键世界决策项。`,
    "这些决策项必须围绕参考作品的世界基底展开，而不是重新发明一套无关的新故事。",
    "要求：",
    "1. 每个决策项都必须是世界层或世界-故事接口层的改造轴，不要写角色动机、具体剧情桥段、男女主感情推进节奏。",
    "2. 每个决策项都必须给出 2-4 个互斥的可选方向 choices，让用户真的能选分支。",
    "3. choices 之间必须体现不同架空路线，例如保留现实、半架空、加入隐性规则，而不是同义改写。",
    "4. 优先围绕现实基底、城市规则、社会压迫结构、地点系统、势力网络、公开与隐秘边界这类真正影响世界的决策。",
    "5. 不要把原作的核心气质彻底改没；如果某个改造方向会让作品失真，应在说明里体现边界。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRetryPrompt(input: GenerateWorldPropertyOptionsInput, optionsCount: number): string {
  const basePrompt = input.referenceMode
    ? buildReferencePrompt(input, optionsCount)
    : buildPrompt(input, optionsCount);
  return [
    basePrompt,
    "",
    "请严格返回 JSON，不要添加任何解释。",
    "如果你不确定，也必须先给出结构化候选，而不是省略 options。",
    "输出示例：",
    `{
  "options": [
    {
      "name": "城市现实性保留程度",
      "description": "决定这次架空改造保留多少原作现实都市质感，会直接影响后续规则、地点和冲突成立方式。",
      "targetLayer": "foundation",
      "reason": "它定义了整个架空改造的边界。",
      "choices": [
        {
          "id": "keep-reality",
          "label": "保持现实都市基底",
          "summary": "城市规则、职业生态和生活压力保持现实，只做轻度结构改造。"
        },
        {
          "id": "hidden-rule",
          "label": "现实外壳下加入隐性规则",
          "summary": "表面仍是现实都市，但在租住、行业与人脉网络背后加入不公开的运行规则。"
        }
      ]
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

  const systemPrompt = input.referenceMode
    ? `你是参考作品架空改造规划师。
请根据用户给出的参考作品锚点、保留要求和改造边界，输出 JSON 对象：
{
  "options": [
    {
      "id": "可选",
      "name": "属性名称",
      "description": "40-90字，说明这个属性决定什么，以及为什么值得在生成前就做选择",
      "targetLayer": "foundation|power|society|culture|history|conflict",
      "reason": "一句话说明它为什么值得优先决策",
      "choices": [
        {
          "id": "choice-a",
          "label": "方向 A",
          "summary": "说明这个方向如何改造原作世界"
        }
      ]
    }
  ]
}
规则：
1. 只输出 JSON 对象，不要输出解释。
2. options 数量必须与要求数量一致。
3. 所有文本必须使用简体中文。
4. targetLayer 只能是 foundation、power、society、culture、history、conflict。
5. 每个 options 都必须包含 2-4 个 choices。
6. choices 必须是互斥的分支方向，而不是同义改写。
7. 不要生成角色动机、感情推进、具体桥段这类故事层选项，要优先生成世界层改造轴。`
    : `你是小说世界生成器的前置决策规划师。
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
    input.referenceMode ? buildReferencePrompt(input, optionsCount) : buildPrompt(input, optionsCount),
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
