import { createContextBlock } from "../../core/contextBudget";
import type { PromptRenderContext, PromptContextBlock } from "../../core/promptTypes";

/**
 * 提示词资产消费创作取向时使用的最小输入。由 modules/novel/creative-profile 编译后传入；
 * 未设置取向的旧书不传（undefined / null），资产渲染结果与改动前逐字一致。
 */
export interface CreativePromptGuidance {
  /** false：关闭旧提示词里的网文默认（网文身份、升级循环、每章钩子、心理/环境禁令、缺钩子扣分、修文补悬念）。 */
  keepWebSerialDefaults: boolean;
  /** 编译后的阶段指导文本。 */
  text: string;
}

export const CREATIVE_PROFILE_CONTEXT_GROUP = "creative_profile";
/** 高于 writing_platform(105) 与 book_contract(104)，并且 required，预算不足时也不会被丢弃。 */
export const CREATIVE_PROFILE_CONTEXT_PRIORITY = 106;

export function keepsWebSerialPromptDefaults(guidance: CreativePromptGuidance | null | undefined): boolean {
  return !guidance || guidance.keepWebSerialDefaults;
}

export function hasCreativeGuidanceText(guidance: CreativePromptGuidance | null | undefined): guidance is CreativePromptGuidance {
  return Boolean(guidance && guidance.text.trim());
}

/** 放进 system 消息的段落；没有指导时返回空数组，调用方展开后不产生任何多余行。 */
export function renderCreativeGuidanceSection(guidance: CreativePromptGuidance | null | undefined): string[] {
  if (!hasCreativeGuidanceText(guidance)) return [];
  return [
    "",
    "【创作取向与叙事策略（用户明确选择；与下方默认规则冲突时以此为准）】",
    guidance.text.trim(),
  ];
}

/** 以上下文块形式提供（正文写作走上下文解析，便于高级模板引用）；required，不被预算丢弃。 */
export function buildCreativeProfileContextBlock(guidance: CreativePromptGuidance | null | undefined): PromptContextBlock | null {
  if (!hasCreativeGuidanceText(guidance)) return null;
  return createContextBlock({
    id: guidance.keepWebSerialDefaults ? "creative_profile:web" : "creative_profile:non_web",
    group: CREATIVE_PROFILE_CONTEXT_GROUP,
    priority: CREATIVE_PROFILE_CONTEXT_PRIORITY,
    required: true,
    allowSummary: false,
    content: guidance.text,
  });
}

/**
 * 槽位取值：用户改过的值永远优先；已选取向时出厂默认服从该取向及其显式叙事策略。
 */
export function pickCreativeAwareSlotText(input: {
  value: string | null | undefined;
  officialDefault: string;
  orientationDefault: string;
  guidance: CreativePromptGuidance | null | undefined;
}): string {
  const value = input.value ?? input.officialDefault;
  if (!hasCreativeGuidanceText(input.guidance)) return value;
  return value.trim() === input.officialDefault.trim() ? input.orientationDefault : value;
}

/** Recover the deterministic choice from the protected runtime block, never from prose keywords. */
export function creativeGuidanceFromContext(context: PromptRenderContext): CreativePromptGuidance | null {
  const block = context.blocks.find((item) => item.group === CREATIVE_PROFILE_CONTEXT_GROUP);
  if (!block) return null;
  return { keepWebSerialDefaults: block.id === "creative_profile:web", text: block.content };
}
