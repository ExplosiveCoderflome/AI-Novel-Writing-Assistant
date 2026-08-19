import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

export type ImagePromptOptimizeLanguage = "zh" | "en";

export interface CharacterImagePromptOptimizeInput {
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage: ImagePromptOptimizeLanguage;
  characterName: string;
  role: string;
  personality: string;
  appearance?: string | null;
  background: string;
}

export const novelCoverBriefSchema = z.object({
  visualHook: z.string().trim().min(1),
  protagonistOrFocus: z.string().trim().min(1),
  environmentAndMood: z.string().trim().min(1),
  composition: z.string().trim().min(1),
  visualMotifs: z.array(z.string().trim().min(1)).min(2).max(6),
  forbiddenElements: z.array(z.string().trim().min(1)).min(2).max(6),
});

export interface NovelCoverBriefPromptInput {
  sourcePrompt: string;
  stylePreset?: string;
  title: string;
  description?: string | null;
  targetAudience?: string | null;
  bookSellingPoint?: string | null;
  competingFeel?: string | null;
  first30ChapterPromise?: string | null;
  commercialTags: string[];
  genreLabel?: string | null;
  primaryStoryModeLabel?: string | null;
  secondaryStoryModeLabel?: string | null;
  worldName?: string | null;
  worldSummary?: string | null;
  styleTone?: string | null;
  narrativePovLabel?: string | null;
  pacePreferenceLabel?: string | null;
  emotionIntensityLabel?: string | null;
}

export interface NovelCoverPromptOptimizeInput {
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage: ImagePromptOptimizeLanguage;
  title: string;
  structuredBrief: z.infer<typeof novelCoverBriefSchema>;
}

export const imageGenerationPromptAssistOutputSchema = z.object({
  summary: z.string().trim().min(1),
  details: z.array(z.string().trim().min(1)).min(2).max(8),
  risks: z.array(z.string().trim().min(1)).max(5).default([]),
  optimizedPrompt: z.string().trim().min(1).optional(),
  changes: z.array(z.string().trim().min(1)).max(6).default([]),
});

export type ImageGenerationPromptAssistOutput = z.infer<typeof imageGenerationPromptAssistOutputSchema>;

export interface ImageGenerationPromptAssistInput {
  action: "explain" | "optimize";
  title?: string;
  kind?: string;
  prompt: string;
  negativePrompt?: string;
  optimizationInstruction?: string;
  provider?: string;
  size?: string;
  referenceImages: Array<{ kind: string; label: string }>;
}

function normalizeOptimizedPrompt(output: string): string {
  let normalized = output.trim();
  normalized = normalized.replace(/^```[a-zA-Z]*\s*/u, "").replace(/\s*```$/u, "").trim();
  normalized = normalized.replace(/^prompt[:：]\s*/iu, "").trim();
  if (!normalized) {
    throw new Error("图片 prompt 优化结果为空。");
  }
  return normalized;
}

export const imageGenerationPromptAssistPrompt: PromptAsset<
  ImageGenerationPromptAssistInput,
  z.infer<typeof imageGenerationPromptAssistOutputSchema>
> = {
  id: "image.generation_prompt.assist",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  outputSchema: imageGenerationPromptAssistOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是图片生成 prompt 助手，服务对象是不懂提示词工程的新手作者。",
      "你要帮助用户在真正生图前理解或优化当前即将发送给图片模型的 prompt。",
      "",
      "只输出合法 JSON，不要输出 Markdown、代码块或额外解释。",
      "",
      "通用规则：",
      "1. 必须尊重原 prompt 的角色身份、场景、构图、画风、参考图用途和硬性限制，不得擅自改变核心设定。",
      "2. 解释时要把复杂 prompt 拆成用户能理解的画面目标、角色/场景约束、参考图作用和模型注意事项。",
      "3. 优化时只让 prompt 更清晰、更可控、更适合图片模型；不得删除性别锁、身份锁、脸型强覆盖、对白气泡规则、无文字/无水印等关键约束。",
      "4. 如果已有参考图，优化结果必须明确这些参考图用于保持一致性，不要让模型照搬参考图机位，除非原 prompt 已要求照搬。",
      "5. negative prompt 只作为风险和约束参考；不要把 negative prompt 混进 optimizedPrompt，除非原 prompt 本身已经包含负面约束。",
      "6. action=optimize 且用户提供了优化要求时，优先按用户自己的语言调整 prompt；如果用户要求会破坏核心设定或关键约束，保留关键约束，并在 risks 或 changes 中说明。",
      "",
      "输出字段：",
      "- summary：一句中文概括。",
      "- details：2-8 条中文要点。",
      "- risks：最多 5 条中文风险或注意事项；没有则空数组。",
      "- optimizedPrompt：仅 action=optimize 时提供，可直接回填到正向 prompt。",
      "- changes：仅 action=optimize 时说明做了哪些改进。",
    ].join("\n")),
    new HumanMessage([
      `动作：${input.action === "optimize" ? "优化当前正向 prompt" : "解释当前正向 prompt"}`,
      `入口标题：${input.title?.trim() || "未提供"}`,
      `入口 kind：${input.kind?.trim() || "未提供"}`,
      `图片 provider：${input.provider?.trim() || "未提供"}`,
      `图片尺寸：${input.size?.trim() || "未提供"}`,
      "",
      "参考素材：",
      input.referenceImages.length
        ? input.referenceImages.map((item, index) => `${index + 1}. ${item.kind}：${item.label}`).join("\n")
        : "无参考素材",
      "",
      "当前正向 prompt：",
      input.prompt,
      "",
      "当前负面 prompt：",
      input.negativePrompt?.trim() || "无",
      "",
      "用户优化要求：",
      input.action === "optimize" ? input.optimizationInstruction?.trim() || "未提供" : "不适用",
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    const normalized = {
      summary: output.summary.trim(),
      details: output.details.map((item) => item.trim()).filter(Boolean),
      risks: output.risks.map((item) => item.trim()).filter(Boolean),
      optimizedPrompt: output.optimizedPrompt?.trim(),
      changes: output.changes.map((item) => item.trim()).filter(Boolean),
    };
    if (input.action === "optimize" && !normalized.optimizedPrompt) {
      throw new Error("优化结果缺少 optimizedPrompt。");
    }
    if (input.action === "explain") {
      normalized.optimizedPrompt = undefined;
      normalized.changes = [];
    }
    return normalized;
  },
};

export const imageCharacterPromptOptimizePrompt: PromptAsset<
  CharacterImagePromptOptimizeInput,
  string,
  string
> = {
  id: "image.character.prompt_optimize",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是角色形象图 prompt 优化器，服务对象是不懂提示词工程的新手作者。",
      "你的任务是把用户现有的角色描述整理成一条可直接发送给图片模型的高质量正向 prompt。",
      "",
      "你只能输出最终 prompt 本身，不要输出解释、标题、注释、代码块、参数说明或多套备选方案。",
      "不要输出 negative prompt，不要输出“Prompt:”前缀。",
      "",
      "优化原则：",
      "1. 优先保留用户已经明确给出的角色事实，不得擅自改角色核心设定。",
      "2. 可以把角色定位、外貌、气质、情绪、服装、姿态、镜头、光线、构图和背景环境整理得更适合图片生成。",
      "3. 如果信息不足，只能做低风险补全，不能凭空发明会改变人物设定的细节。",
      "4. 输出必须更适合角色形象图生成，而不是小说介绍、人物小传或分析文字。",
      "5. 如果给了风格预设，要自然融入 prompt，而不是单独解释它。",
      "",
      "语言要求：",
      input.outputLanguage === "en"
        ? "本次最终 prompt 必须主要使用英文输出，但角色专有名词可保留原名。"
        : "本次最终 prompt 必须使用简体中文输出。",
      "",
      "质量要求：",
      "1. 让模型能直接抓到人物外观、气质和画面重点。",
      "2. 表达要具体、紧凑、可视化，避免空话、分析腔和重复堆砌。",
      "3. 不要输出列表编号，不要解释你做了什么。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下角色信息，输出一条最终图片生成 prompt：",
      "",
      `角色名：${input.characterName}`,
      `角色定位：${input.role}`,
      `性格特征：${input.personality}`,
      `外貌体态：${input.appearance ?? "未提供"}`,
      `背景经历：${input.background}`,
      `风格预设：${input.stylePreset?.trim() || "未提供"}`,
      "",
      "用户当前描述：",
      input.sourcePrompt,
    ].join("\n")),
  ],
  postValidate: (output) => normalizeOptimizedPrompt(output),
};

export const imageNovelCoverBriefPrompt: PromptAsset<
  NovelCoverBriefPromptInput,
  z.infer<typeof novelCoverBriefSchema>,
  z.infer<typeof novelCoverBriefSchema>
> = {
  id: "image.novel_cover.brief",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: novelCoverBriefSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说封面视觉策划助手，服务对象是不懂视觉策划和提示词工程的新手作者。",
      "你的任务是先把用户这本书的封面意图整理成一个稳定、可控、可继续加工的结构化 brief。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释或额外文本。",
      "",
      "字段必须且只能包括：",
      "{\"visualHook\":\"...\",\"protagonistOrFocus\":\"...\",\"environmentAndMood\":\"...\",\"composition\":\"...\",\"visualMotifs\":[\"...\"],\"forbiddenElements\":[\"...\"]}",
      "",
      "全局规则：",
      "1. 目标是小说封面主画面，不是海报文案，不是故事简介，不是美术评语。",
      "2. 本阶段只整理视觉意图，不直接写成长 prompt。",
      "3. 必须优先保留小说已知卖点和用户当前希望强调的画面重点，不得脱离原书重新发明题材。",
      "4. 画面默认是不带文字的主画面，forbiddenElements 必须明确限制书名文字、水印、logo 等干扰元素。",
      "5. 输出必须具体、可视化，避免空泛形容词堆砌。",
      "",
      "字段要求：",
      "1. visualHook：一句话说明封面最抓人的视觉钩子。",
      "2. protagonistOrFocus：说明主角、核心物件或主要视觉焦点。",
      "3. environmentAndMood：说明环境、氛围、光影与情绪方向。",
      "4. composition：说明构图、镜头距离或主体摆放方式，默认面向竖版封面。",
      "5. visualMotifs：给 2-6 个可以直接用于画面的视觉元素或符号。",
      "6. forbiddenElements：给 2-6 个必须避免的干扰元素，至少包含 readable text / watermark 一类的要求。",
      "",
      "补全规则：",
      "1. 信息不足时只做低风险补全，不得擅自引入会改变卖点的大设定。",
      "2. 如果小说本身更适合“意象封面”而不是人物封面，可以让主焦点变成物件、场景或异常规则痕迹。",
      "3. 如果用户当前描述与小说元信息冲突，以用户当前描述为更高优先级，但不得彻底背离本书基础定位。",
    ].join("\n")),
    new HumanMessage([
      "请根据以下小说信息和用户当前想法，整理封面 brief。",
      "",
      `书名：${input.title}`,
      `一句话概述：${input.description ?? "未提供"}`,
      `目标读者：${input.targetAudience ?? "未提供"}`,
      `核心卖点：${input.bookSellingPoint ?? "未提供"}`,
      `阅读气质：${input.competingFeel ?? "未提供"}`,
      `前30章兑现：${input.first30ChapterPromise ?? "未提供"}`,
      `商业标签：${input.commercialTags.join("、") || "未提供"}`,
      `题材基底：${input.genreLabel ?? "未提供"}`,
      `主推进模式：${input.primaryStoryModeLabel ?? "未提供"}`,
      `副推进模式：${input.secondaryStoryModeLabel ?? "未提供"}`,
      `世界名称：${input.worldName ?? "未提供"}`,
      `世界氛围：${input.worldSummary ?? "未提供"}`,
      `文风关键词：${input.styleTone ?? "未提供"}`,
      `叙事视角：${input.narrativePovLabel ?? "未提供"}`,
      `节奏倾向：${input.pacePreferenceLabel ?? "未提供"}`,
      `情绪浓度：${input.emotionIntensityLabel ?? "未提供"}`,
      `风格预设：${input.stylePreset?.trim() || "未提供"}`,
      "",
      "用户当前描述：",
      input.sourcePrompt,
    ].join("\n")),
  ],
  postValidate: (output) => ({
    ...output,
    visualHook: output.visualHook.trim(),
    protagonistOrFocus: output.protagonistOrFocus.trim(),
    environmentAndMood: output.environmentAndMood.trim(),
    composition: output.composition.trim(),
    visualMotifs: output.visualMotifs.map((item) => item.trim()),
    forbiddenElements: output.forbiddenElements.map((item) => item.trim()),
  }),
};

export const imageNovelCoverPromptOptimizePrompt: PromptAsset<
  NovelCoverPromptOptimizeInput,
  string,
  string
> = {
  id: "image.novel_cover.prompt_optimize",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是小说封面图片 prompt 优化器，服务对象是不懂视觉提示词工程的新手作者。",
      "你的任务是根据结构化 brief 和用户当前描述，输出一条可直接发送给图片模型的最终正向 prompt。",
      "",
      "你只能输出最终 prompt 本身，不要输出解释、标题、注释、代码块、参数说明或多套备选方案。",
      "不要输出 negative prompt，不要输出“Prompt:”前缀。",
      "",
      "全局要求：",
      "1. 目标是小说封面主画面，不是海报排版稿，不要生成可读书名文字。",
      "2. 画面默认适合竖版网文封面展示，主体必须清晰、识别度高、缩略图下也能抓到重点。",
      "3. 你可以强化光线、构图、镜头、材质、氛围和视觉符号，但不能背离小说的核心卖点。",
      "4. 如果更适合意象封面，可以突出核心物件、空间或异常规则痕迹，而不是强行塞人物半身像。",
      "5. 风格预设如果存在，必须自然融入 prompt。",
      "",
      "语言要求：",
      input.outputLanguage === "en"
        ? "本次最终 prompt 必须主要使用英文输出，但中文书名和专有名词可以保留原名。"
        : "本次最终 prompt 必须使用简体中文输出。",
      "",
      "质量要求：",
      "1. 表达具体、紧凑、可视化。",
      "2. 不要写成分析说明，不要列表编号。",
      "3. 要让模型直接知道主体、环境、氛围、构图和禁忌。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下信息，输出最终封面图片 prompt：",
      "",
      `书名：${input.title}`,
      `风格预设：${input.stylePreset?.trim() || "未提供"}`,
      "",
      "结构化 brief：",
      JSON.stringify(input.structuredBrief, null, 2),
      "",
      "用户当前描述：",
      input.sourcePrompt,
    ].join("\n")),
  ],
  postValidate: (output) => normalizeOptimizedPrompt(output),
};
