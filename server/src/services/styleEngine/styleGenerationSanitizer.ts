import type {
  ResolvedStyleContext,
  StyleProfile,
  StyleSanitizedGenerationProfile,
} from "@ai-novel/shared/types/styleEngine";
import { buildWriterStyleContractText, WRITER_STYLE_CONTRACT_SECTIONS } from "./styleContractText";

type StyleProfileLike = Partial<StyleProfile> & {
  name?: string | null;
  summary?: string | null;
};

type StyleContextWithSanitizedProfile = {
  sanitizedGenerationProfile?: StyleSanitizedGenerationProfile | null;
};

const ENTITY_SUFFIXES = [
  "世子",
  "殿下",
  "王妃",
  "王爷",
  "太子",
  "公主",
  "皇帝",
  "帝君",
  "剑神",
  "刀神",
  "剑仙",
  "宗主",
  "掌门",
  "城主",
  "将军",
  "军师",
  "国师",
  "侯爷",
  "王朝",
  "王府",
  "皇宫",
  "神殿",
  "圣地",
  "书院",
  "宗门",
  "门阀",
  "帮主",
  "盟主",
  "府邸",
  "王城",
  "郡城",
  "山庄",
  "镖局",
  "楼阁",
  "阁主",
  "寨主",
  "营地",
  "军营",
];
const ENTITY_SUFFIX_PATTERN = new RegExp(
  `[\\u4e00-\\u9fa5]{1,16}(?:${ENTITY_SUFFIXES.join("|")})`,
  "g",
);
const ENTITY_SUFFIX_END_PATTERN = new RegExp(`(?:${ENTITY_SUFFIXES.join("|")})$`);
const BOOK_TITLE_PATTERN = /《([^》]{2,30})》/g;
const MAX_FORBIDDEN_ENTITY_COUNT = 60;
const MAX_GUIDANCE_LINES = 80;
const MAX_GUIDANCE_LINE_LENGTH = 220;

const GENERIC_ENTITY_STOPWORDS = new Set([
  "主角",
  "配角",
  "反派",
  "读者",
  "作者",
  "人物",
  "角色",
  "章节",
  "故事",
  "剧情",
  "正文",
  "小说",
  "世界",
  "系统",
  "写法",
  "风格",
  "文本",
  "作品",
  "情节",
  "信息",
  "场景",
  "对话",
]);

function compactText(value: unknown, limit = 4000): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? normalized.slice(0, limit) : normalized;
}

function normalizeEntity(value: string): string {
  return value
    .replace(/["'“”‘’\s,，。；;：:《》【】（）()]/g, "")
    .trim();
}

function isAllowedEntity(value: string): boolean {
  if (value.length < 2 || value.length > 24) {
    return false;
  }
  if (GENERIC_ENTITY_STOPWORDS.has(value)) {
    return false;
  }
  if (/^\d+$/.test(value)) {
    return false;
  }
  return /[\u4e00-\u9fa5]/.test(value);
}

function collectProfileText(profile: StyleProfileLike | undefined): string {
  if (!profile) {
    return "";
  }
  const featureText = (profile.extractedFeatures ?? [])
    .flatMap((feature) => [
      feature.label,
      feature.description,
      feature.evidence,
    ])
    .join("\n");
  return [
    profile.name,
    profile.description,
    profile.summary,
    profile.sourceContent,
    profile.analysisMarkdown,
    featureText,
  ].map((item) => compactText(item)).filter(Boolean).join("\n");
}

function extractEntityCandidates(text: string): string[] {
  const entities = new Set<string>();
  const addEntity = (value: string) => {
    const entity = normalizeEntity(value);
    if (isAllowedEntity(entity)) {
      entities.add(entity);
    }
  };
  for (const match of text.matchAll(BOOK_TITLE_PATTERN)) {
    addEntity(match[1] ?? "");
  }
  for (const match of text.matchAll(ENTITY_SUFFIX_PATTERN)) {
    const entity = normalizeEntity(match[0] ?? "");
    addEntity(entity);
    for (let length = 4; length < entity.length && length <= 12; length += 1) {
      const tail = entity.slice(-length);
      if (ENTITY_SUFFIX_END_PATTERN.test(tail)) {
        addEntity(tail);
      }
    }
  }
  return Array.from(entities)
    .sort((left, right) => right.length - left.length || left.localeCompare(right, "zh-Hans-CN"))
    .slice(0, MAX_FORBIDDEN_ENTITY_COUNT);
}

function redactForbiddenEntities(text: string, forbiddenEntities: string[]): string {
  return forbiddenEntities.reduce((current, entity) => {
    if (!entity) {
      return current;
    }
    return current.split(entity).join("[source-entity]");
  }, text);
}

function splitGuidanceLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => (line.length > MAX_GUIDANCE_LINE_LENGTH ? `${line.slice(0, MAX_GUIDANCE_LINE_LENGTH)}...` : line))
    .slice(0, MAX_GUIDANCE_LINES);
}

export function sanitizeStyleContextForGeneration(
  context: ResolvedStyleContext,
  now: Date = new Date(),
): ResolvedStyleContext {
  const sourceProfileNames = Array.from(new Set(
    context.matchedBindings
      .map((binding) => binding.styleProfile?.name?.trim())
      .filter((name): name is string => Boolean(name)),
  ));
  const contractText = buildWriterStyleContractText(context.compiledBlocks?.contract ?? null);
  const sourceText = [
    contractText,
    ...context.matchedBindings.map((binding) => collectProfileText(binding.styleProfile)),
  ].filter(Boolean).join("\n");
  const forbiddenEntities = extractEntityCandidates(sourceText);
  const sanitizedContractText = redactForbiddenEntities(contractText, forbiddenEntities);
  const compiledBlocks = context.compiledBlocks ? {
    ...context.compiledBlocks,
    contract: { ...context.compiledBlocks.contract },
  } : null;
  if (compiledBlocks) {
    for (const key of WRITER_STYLE_CONTRACT_SECTIONS) {
      const section = compiledBlocks.contract[key];
      compiledBlocks.contract[key] = {
        ...section,
        summary: section.summary == null ? section.summary : redactForbiddenEntities(section.summary, forbiddenEntities),
        lines: section.lines.map(line => redactForbiddenEntities(line, forbiddenEntities)),
        text: redactForbiddenEntities(section.text, forbiddenEntities),
      };
    }
    for (const key of ["context", "style", "character", "antiAi", "output", "selfCheck"] as const) {
      compiledBlocks[key] = redactForbiddenEntities(compiledBlocks[key], forbiddenEntities);
    }
  }
  const writingGuidance = splitGuidanceLines(sanitizedContractText);
  const sanitizedGenerationProfile: StyleSanitizedGenerationProfile = {
    writingGuidance,
    forbiddenEntities,
    sourceProfileNames,
    sanitizedAt: now.toISOString(),
    strategy: "deterministic",
  };
  return {
    ...context,
    compiledBlocks,
    sanitizedGenerationProfile,
  };
}

export function detectForbiddenStyleEntities(
  content: string,
  styleContext: StyleContextWithSanitizedProfile | null | undefined,
): string[] {
  const forbiddenEntities = styleContext?.sanitizedGenerationProfile?.forbiddenEntities ?? [];
  if (!content.trim() || forbiddenEntities.length === 0) {
    return [];
  }
  const leakedEntities = forbiddenEntities.filter((entity) => entity && content.includes(entity));
  return leakedEntities.filter((entity) => (
    !leakedEntities.some((other) => other !== entity && other.includes(entity))
  ));
}
