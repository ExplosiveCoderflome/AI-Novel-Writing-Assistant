import type { PromptContextBlock } from "../../core/promptTypes";

function toOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 2));
}

function createBlock(input: {
  id: string;
  group: string;
  priority: number;
  content: string | null | undefined;
  required?: boolean;
}): PromptContextBlock | null {
  const content = toOptionalText(input.content);
  if (!content) {
    return null;
  }
  return {
    id: input.id,
    group: input.group,
    priority: input.priority,
    required: input.required ?? false,
    estimatedTokens: estimateTokens(content),
    content,
  };
}

function joinLines(lines: Array<string | null | undefined>): string | null {
  const normalized = lines
    .map((line) => toOptionalText(line))
    .filter((line): line is string => Boolean(line));
  return normalized.length > 0 ? normalized.join("\n") : null;
}

function extractByPatterns(source: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export interface CharacterAnchorHints {
  currentIdentity: string | null;
  hiddenIdentity: string | null;
  era: string | null;
  institution: string | null;
}

export function extractCharacterAnchorHints(storyInput: string): CharacterAnchorHints {
  const normalized = storyInput.trim();
  if (!normalized) {
    return {
      currentIdentity: null,
      hiddenIdentity: null,
      era: null,
      institution: null,
    };
  }

  const currentIdentity = extractByPatterns(normalized, [
    /成为([^，。；\n]+)/,
    /化身(?:成|为)([^，。；\n]+)/,
    /扮成([^，。；\n]+)/,
    /以([^，。；\n]+?)身份/,
  ]);
  const hiddenIdentity = extractByPatterns(normalized, [
    /竟然就是([^，。；\n]+)/,
    /其实就是([^，。；\n]+)/,
    /真实身份(?:是|竟是)([^，。；\n]+)/,
    /最后发现自己[^，。；\n]*就是([^，。；\n]+)/,
    /原来(?:他|她|自己)?就是([^，。；\n]+)/,
  ]);
  const era = extractByPatterns(normalized, [
    /(秦朝|汉朝|唐朝|宋朝|元朝|明朝|清朝|战国|三国|春秋|隋朝|晋朝|南北朝)/,
    /(民国|晚清|先秦|大秦|大汉|大唐|大宋)/,
  ]);
  const institution = extractByPatterns(normalized, [
    /(宫廷|后宫|东宫|朝堂|官场|内廷|禁军|宗门|仙门|公司|财阀|校园|军营)/,
    /(太监|宦官|宫女|丞相|侍卫|皇帝|太子|王爷|侯府|厂卫|首辅)/,
  ]);

  return {
    currentIdentity,
    hiddenIdentity,
    era,
    institution,
  };
}

function stringifyJsonLike(value: string | null | undefined, fallback: string): string {
  return toOptionalText(value) ?? fallback;
}

export interface CharacterCastContextBlocksInput {
  projectTitle: string;
  storyInput: string;
  genreName?: string | null;
  storyModeBlock?: string | null;
  styleTone?: string | null;
  narrativePov?: string | null;
  pacePreference?: string | null;
  emotionIntensity?: string | null;
  corePromise?: string | null;
  coreSetting?: string | null;
  characterArcs?: string | null;
  worldRules?: string | null;
  worldStage?: string | null;
  storyDecomposition?: string | null;
  constraintEngine?: string | null;
  bookContract?: {
    readingPromise: string;
    protagonistFantasy: string;
    coreSellingPoint: string;
    chapter3Payoff: string;
    chapter10Payoff: string;
    chapter30Payoff: string;
    escalationLadder: string;
    relationshipMainline: string;
  } | null;
  existingCharacterNames?: string[];
}

export function buildCharacterCastContextBlocks(input: CharacterCastContextBlocksInput): PromptContextBlock[] {
  const anchors = extractCharacterAnchorHints(input.storyInput);
  const blocks = [
    createBlock({
      id: "character_cast_story_input",
      group: "idea_seed",
      priority: 100,
      required: true,
      content: joinLines([
        "【故事输入】",
        input.storyInput,
      ]),
    }),
    createBlock({
      id: "character_cast_project_context",
      group: "project_context",
      priority: 95,
      content: joinLines([
        "【项目上下文】",
        `项目标题：${input.projectTitle}`,
        `题材：${toOptionalText(input.genreName) ?? "未指定"}`,
        input.storyModeBlock ? `故事模式：\n${input.storyModeBlock}` : "故事模式：无",
        `文风基调：${toOptionalText(input.styleTone) ?? "未指定"}`,
        `叙事视角：${toOptionalText(input.narrativePov) ?? "未指定"}`,
        `节奏偏好：${toOptionalText(input.pacePreference) ?? "未指定"}`,
        `情绪强度：${toOptionalText(input.emotionIntensity) ?? "未指定"}`,
      ]),
    }),
    createBlock({
      id: "character_cast_book_contract",
      group: "book_contract",
      priority: 92,
      content: input.bookContract ? joinLines([
        "【Book Contract 约束】",
        `阅读承诺：${input.bookContract.readingPromise}`,
        `主角幻想：${input.bookContract.protagonistFantasy}`,
        `核心卖点：${input.bookContract.coreSellingPoint}`,
        `第3章兑现：${input.bookContract.chapter3Payoff}`,
        `第10章兑现：${input.bookContract.chapter10Payoff}`,
        `第30章兑现：${input.bookContract.chapter30Payoff}`,
        `升级阶梯：${input.bookContract.escalationLadder}`,
        `关系主线：${input.bookContract.relationshipMainline}`,
      ]) : null,
    }),
    createBlock({
      id: "character_cast_macro_constraints",
      group: "macro_constraints",
      priority: 90,
      content: joinLines([
        "【故事宏观约束】",
        `核心承诺：${toOptionalText(input.corePromise) ?? "暂无"}`,
        `核心设定：${toOptionalText(input.coreSetting) ?? "暂无"}`,
        `角色弧提示：${toOptionalText(input.characterArcs) ?? "暂无"}`,
        `世界规则：${toOptionalText(input.worldRules) ?? "暂无"}`,
        `宏观拆解：${stringifyJsonLike(input.storyDecomposition, "暂无")}`,
        `约束引擎：${stringifyJsonLike(input.constraintEngine, "暂无")}`,
      ]),
    }),
    createBlock({
      id: "character_cast_world_stage",
      group: "world_stage",
      priority: 88,
      content: joinLines([
        "【世界舞台】",
        toOptionalText(input.worldStage) ?? "当前还没有绑定世界观，请优先从故事输入和书级约束推断人物舞台。",
      ]),
    }),
    createBlock({
      id: "character_cast_protagonist_anchor",
      group: "protagonist_anchor",
      priority: 99,
      required: true,
      content: joinLines([
        "【主角锚点】",
        "主角必须落成可直接进入正文的具体人物，不允许写成功能位或抽象槽位。",
        `主角当前外显身份线索：${anchors.currentIdentity ?? "未从原始输入中稳定抽取，请直接根据故事输入推断。"}`,
        `时代线索：${anchors.era ?? "未明确"}`,
        `制度 / 舞台线索：${anchors.institution ?? "未明确"}`,
      ]),
    }),
    createBlock({
      id: "character_cast_hidden_identity",
      group: "hidden_identity_anchor",
      priority: 97,
      content: joinLines([
        "【隐藏身份 / 真相锚点】",
        anchors.hiddenIdentity
          ? `当前故事存在明确隐藏身份或终局真相线索：${anchors.hiddenIdentity}`
          : "如果故事包含身份反转、伪装、命运真相或历史真名，这条线必须在角色阵容里被显式承接，而不是被抽象成功能词。",
      ]),
    }),
    createBlock({
      id: "character_cast_forbidden_names",
      group: "forbidden_names",
      priority: 80,
      content: joinLines([
        "【命名边界】",
        `禁止复用的现有角色名：${(input.existingCharacterNames ?? []).filter(Boolean).join("、") || "无"}`,
      ]),
    }),
    createBlock({
      id: "character_cast_output_policy",
      group: "output_policy",
      priority: 100,
      required: true,
      content: joinLines([
        "【输出策略】",
        "name 只能写可入戏的人名、宫廷称谓、阵营职称、江湖称号或历史语境内成立的稳定称呼。",
        "禁止把“谜团催化剂、知识导师位、外部威胁位、情感位、关系变量、功能位”这类抽象职责名写进 name。",
        "storyFunction 才负责写叙事职责，name 不负责承载功能描述。",
        "每个角色都必须输出 gender；拿不准时填 unknown，不能省略。",
        "如果是历史 / 穿越 / 宫廷题材，阵容必须体现时代身份、制度压迫、权力链条和身份反差，不能退化成通用功能网络。",
      ]),
    }),
  ];

  return blocks.filter((block): block is PromptContextBlock => Boolean(block));
}

export interface CharacterCastSupplementalContextBlocksInput {
  projectTitle: string;
  modeLabel: string;
  targetRoleLabel: string;
  requestedCountText: string;
  userPrompt?: string | null;
  storyInput?: string | null;
  genreName?: string | null;
  storyModeBlock?: string | null;
  styleTone?: string | null;
  narrativePov?: string | null;
  pacePreference?: string | null;
  emotionIntensity?: string | null;
  corePromise?: string | null;
  coreSetting?: string | null;
  characterArcs?: string | null;
  worldRules?: string | null;
  worldStage?: string | null;
  storyDecomposition?: string | null;
  constraintEngine?: string | null;
  existingCharactersText?: string | null;
  anchorCharactersText?: string | null;
  relationsText?: string | null;
  forbiddenNames?: string[];
}

export function buildSupplementalCharacterContextBlocks(
  input: CharacterCastSupplementalContextBlocksInput,
): PromptContextBlock[] {
  const blocks = [
    createBlock({
      id: "supplemental_character_request",
      group: "idea_seed",
      priority: 100,
      required: true,
      content: joinLines([
        "【补位请求】",
        `项目标题：${input.projectTitle}`,
        `补位模式：${input.modeLabel}`,
        `目标角色功能：${input.targetRoleLabel}`,
        input.requestedCountText,
        `用户额外说明：${toOptionalText(input.userPrompt) ?? "无"}`,
      ]),
    }),
    createBlock({
      id: "supplemental_character_story_context",
      group: "project_context",
      priority: 90,
      content: joinLines([
        "【故事上下文】",
        `故事输入：${toOptionalText(input.storyInput) ?? "暂无明确故事输入，请结合现有角色与世界舞台推断。 "}`,
        `题材：${toOptionalText(input.genreName) ?? "未指定"}`,
        input.storyModeBlock ? `故事模式：\n${input.storyModeBlock}` : "故事模式：无",
        `文风基调：${toOptionalText(input.styleTone) ?? "未指定"}`,
        `叙事视角：${toOptionalText(input.narrativePov) ?? "未指定"}`,
        `节奏偏好：${toOptionalText(input.pacePreference) ?? "未指定"}`,
        `情绪强度：${toOptionalText(input.emotionIntensity) ?? "未指定"}`,
        `核心承诺：${toOptionalText(input.corePromise) ?? "暂无"}`,
        `核心设定：${toOptionalText(input.coreSetting) ?? "暂无"}`,
        `角色弧提示：${toOptionalText(input.characterArcs) ?? "暂无"}`,
        `世界规则：${toOptionalText(input.worldRules) ?? "暂无"}`,
      ]),
    }),
    createBlock({
      id: "supplemental_character_world_stage",
      group: "world_stage",
      priority: 85,
      content: joinLines([
        "【世界与宏观约束】",
        toOptionalText(input.worldStage) ?? "当前未绑定世界观。",
        `宏观拆解：${stringifyJsonLike(input.storyDecomposition, "暂无")}`,
        `约束引擎：${stringifyJsonLike(input.constraintEngine, "暂无")}`,
      ]),
    }),
    createBlock({
      id: "supplemental_character_existing_cast",
      group: "existing_cast",
      priority: 95,
      content: joinLines([
        "【已有角色】",
        toOptionalText(input.existingCharactersText) ?? "当前还没有已创建角色。",
        "【锚点角色】",
        toOptionalText(input.anchorCharactersText) ?? "当前没有明确选中的锚点角色。",
      ]),
    }),
    createBlock({
      id: "supplemental_character_relations",
      group: "relation_context",
      priority: 88,
      content: joinLines([
        "【已知结构化关系】",
        toOptionalText(input.relationsText) ?? "暂无。",
      ]),
    }),
    createBlock({
      id: "supplemental_character_forbidden_names",
      group: "forbidden_names",
      priority: 80,
      content: joinLines([
        "【命名边界】",
        `禁止复用的角色名：${(input.forbiddenNames ?? []).filter(Boolean).join("、") || "无"}`,
      ]),
    }),
  ];

  return blocks.filter((block): block is PromptContextBlock => Boolean(block));
}
