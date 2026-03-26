import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import type { StoryModeProfile } from "@ai-novel/shared/types/storyMode";
import {
  storyModeChildDraftListSchema,
  storyModeChildDraftNodeSchema,
  storyModeDraftNodeSchema,
} from "./storyMode.promptSchemas";

export interface StoryModeTreePromptInput {
  prompt: string;
}

export interface StoryModeChildPromptInput {
  prompt?: string;
  count: number;
  parentName: string;
  parentDescription: string;
  parentTemplate: string;
  parentProfile: StoryModeProfile;
  existingSiblingNames: string[];
}

function formatOptionalSection(label: string, value: string): string {
  const trimmed = value.trim();
  return `${label}：${trimmed || "无"}`;
}

function formatStoryModeProfile(profile: StoryModeProfile): string {
  return [
    `coreDrive：${profile.coreDrive}`,
    `readerReward：${profile.readerReward}`,
    `progressionUnits：${profile.progressionUnits.join("、")}`,
    `allowedConflictForms：${profile.allowedConflictForms.join("、")}`,
    `forbiddenConflictForms：${profile.forbiddenConflictForms.join("、")}`,
    `conflictCeiling：${profile.conflictCeiling}`,
    `resolutionStyle：${profile.resolutionStyle}`,
    `chapterUnit：${profile.chapterUnit}`,
    `volumeReward：${profile.volumeReward}`,
    `mandatorySignals：${profile.mandatorySignals.join("、")}`,
    `antiSignals：${profile.antiSignals.join("、")}`,
  ].join("\n");
}

function normalizeNameKey(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export const storyModeTreePrompt: PromptAsset<
  StoryModeTreePromptInput,
  z.infer<typeof storyModeDraftNodeSchema>
> = {
  id: "storyMode.tree.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: storyModeDraftNodeSchema,
  render: (input) => [
    new SystemMessage([
      "你是资深网络小说流派模式策划专家。",
      "你的任务是根据用户给出的创作方向，生成一棵可用于创作规划、模式约束和产品配置的“两级流派模式树”。",
      "这棵树不是简单列标签，而是要输出可区分、可执行、可复用的流派模式结构。",
      "",
      "只返回一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "结构规则：",
      "1. 最多两级树：顶层是流派模式父类，第二层是具体流派模式子类。",
      "2. 每个节点都必须输出且只输出以下固定键：name、description、template、profile、children。",
      "3. 第二层节点的 children 必须为 []。",
      "4. 不要缺键、不要改键名、不要新增近义字段。",
      "5. 整体必须是一棵结构清晰的单树，不要输出多个并列根节点。",
      "",
      "节点要求：",
      "1. name：名称必须简洁、稳定、可直接作为系统标签或模式名使用，不要写成长句或宣传语。",
      "2. description：说明该模式的核心叙事特征、主要爽点来源、冲突组织方式或读者预期，避免“很好看”“很有代入感”这类空话。",
      "3. template：写该模式最典型的剧情推进模板或叙事骨架，必须具体到创作层面，不能只写抽象概念。",
      "4. profile：必须承担真正的控制逻辑，不允许把关键规则偷藏在 name 或 description 里。",
      "",
      "profile 固定结构要求：",
      "profile 必须严格包含以下键：",
      "coreDrive, readerReward, progressionUnits, allowedConflictForms, forbiddenConflictForms, conflictCeiling, resolutionStyle, chapterUnit, volumeReward, mandatorySignals, antiSignals。",
      "",
      "profile 字段解释：",
      "1. coreDrive：该模式最核心的推进驱动力，说明故事为什么能持续往前走。",
      "2. readerReward：读者持续阅读该模式时最稳定获得的满足类型。",
      "3. progressionUnits：该模式常用的推进单元，说明剧情通常以什么单位滚动前进。",
      "4. allowedConflictForms：适合该模式的冲突形式，写可接受、可高频使用的冲突类型。",
      "5. forbiddenConflictForms：不适合该模式、容易破坏模式体验的冲突形式。",
      "6. conflictCeiling：该模式冲突上限或压力上限应控制在什么区间，体现强度边界。",
      "7. resolutionStyle：该模式常见的化解方式、兑现方式或收束方式。",
      "8. chapterUnit：单章层面最适合承载的内容单位或小钩子单位。",
      "9. volumeReward：卷级别应兑现的阶段性奖励或阶段性成果。",
      "10. mandatorySignals：该模式必须反复给读者的明确信号，用来稳固模式预期。",
      "11. antiSignals：会让读者误判模式、削弱模式体验、或导致模式跑偏的反信号。",
      "",
      "策划规则：",
      "1. 顶层父类负责抽象模式方向，第二层子类负责落到可执行的具体模式变体。",
      "2. 同层节点之间必须有明确区分度，不能只是换个说法重复同一种模式。",
      "3. 子类必须是在父类逻辑下的自然细分，不要突然切换分类维度。",
      "4. 不得使用“因为它叫某某流，所以必须怎样”这种按名称硬绑定的偷懒写法，必须把约束逻辑写进 profile。",
      "5. 如果用户描述较模糊，应做保守、低风险、行业常见的模式归纳，不要过度发散。",
      "6. 输出结果要可直接供后续创作系统消费，因此字段内容应具体、稳定、避免空泛修辞。",
      "",
      "风格规则：",
      "1. 全部内容使用简体中文。",
      "2. 数组字段应使用简洁短语，不要写成长段解释。",
      "3. 字符串字段要具体、可执行，避免抽象套话。",
      "4. 各字段之间必须一致，不得互相冲突。",
    ].join("\n")),
    new HumanMessage([
      "请根据下面的创作方向生成根流派模式及其子类草稿：",
      "",
      input.prompt.trim(),
    ].join("\n")),
  ],
};

export const storyModeChildPrompt: PromptAsset<
  StoryModeChildPromptInput,
  z.infer<typeof storyModeChildDraftListSchema>,
  z.infer<typeof storyModeChildDraftListSchema>
> = {
  id: "storyMode.child.generate",
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
  outputSchema: storyModeChildDraftListSchema,
  render: (input) => [
    new SystemMessage([
      "你是资深网络小说流派模式策划专家。",
      "你的任务不是生成整棵树，而是基于给定父类，补出一组可以直接挂载到该父类下的子类流派模式节点。",
      "这些子类节点必须可区分、可执行、可直接进入后续创作系统使用。",
      "",
      "只返回一个合法 JSON 数组，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "结构规则：",
      `1. 必须精确生成 ${input.count} 个子类节点，不要生成父节点，不要少于或多于要求数量。`,
      "2. 最外层必须是 JSON 数组，数组中的每一项都是一个子类节点对象。",
      "3. 每个节点只输出且只允许以下固定键：name、description、template、profile、children。",
      "4. 每个节点的 children 必须是 []，不得继续生成孙级节点。",
      "5. 不要缺键、不要改键名、不要新增近义字段。",
      "",
      "子类生成规则：",
      "1. 每个子类都必须是给定父类逻辑下的自然细分，不能切换到别的分类维度。",
      "2. 必须延续父类 profile 的核心控制逻辑，但要在体验结构、冲突组织、推进单位、兑现方式或叙事侧重上形成清晰区分。",
      "3. 生成的多个子类之间必须彼此有明显差异，不能只是换个说法重复同一种模式。",
      "4. 不能与已有兄弟节点重名，不能只是复述已有兄弟节点，也不能输出父类本身。",
      "5. 必须下钻到可以直接使用的具体子模式，不要停留在模糊标签层。",
      "6. 如果用户补充较少，也必须直接根据父类逻辑和现有兄弟节点进行保守、低风险、行业常见的细分，不要回避生成。",
      "7. 若父类本身已非常具体，子类应在不破坏父类逻辑的前提下做体验型、组织型或兑现型细分，而不是硬拆出不自然的类别。",
      "",
      "节点要求：",
      "1. name：名称必须简洁、稳定、可直接作为系统标签使用，不要写宣传语、口号或解释式长名称。",
      "2. description：说明该子类的核心叙事特征、爽点来源、冲突组织方式或读者预期，必须具体，避免空话。",
      "3. template：写该子类最典型的剧情推进模板或叙事骨架，必须具体到创作层面，不能只写抽象概念。",
      "4. profile：必须承担真正的控制逻辑，不允许把关键规则偷藏在 name 或 description 里。",
      "",
      "profile 固定结构要求：",
      "profile 必须严格包含以下键：",
      "coreDrive, readerReward, progressionUnits, allowedConflictForms, forbiddenConflictForms, conflictCeiling, resolutionStyle, chapterUnit, volumeReward, mandatorySignals, antiSignals。",
      "",
      "profile 字段要求：",
      "1. coreDrive：说明该子模式最核心的持续推进驱动力。",
      "2. readerReward：说明读者持续阅读时最稳定获得的满足类型。",
      "3. progressionUnits：说明剧情以什么单位持续推进。",
      "4. allowedConflictForms：写适合高频使用的冲突形式。",
      "5. forbiddenConflictForms：写会破坏该模式体验的冲突形式。",
      "6. conflictCeiling：写清冲突强度或压力上限，不要模糊。",
      "7. resolutionStyle：写清该模式常见的化解方式或兑现方式。",
      "8. chapterUnit：写单章最适合承载的推进单元或小钩子单元。",
      "9. volumeReward：写卷级别应兑现的阶段性奖励或成果。",
      "10. mandatorySignals：写必须反复给读者的稳定信号。",
      "11. antiSignals：写会让模式跑偏、削弱体验或误导读者预期的反信号。",
      "",
      "风格规则：",
      "1. 全部内容使用简体中文。",
      "2. 数组字段使用简洁短语，不要写成长段解释。",
      "3. 字符串字段要具体、可执行，避免抽象套话。",
      "4. 各字段之间必须一致，不得互相冲突。",
      "5. 输出结果要像可直接落库和配置的模式节点，而不是泛泛而谈的策划说明。",
    ].join("\n")),
    new HumanMessage([
      `当前任务：请为下面这个父类精确生成 ${input.count} 个新的子类流派模式节点。`,
      "",
      `父类名称：${input.parentName.trim()}`,
      formatOptionalSection("父类说明", input.parentDescription),
      formatOptionalSection("父类模板", input.parentTemplate),
      "父类 profile：",
      formatStoryModeProfile(input.parentProfile),
      "",
      `现有兄弟节点：${input.existingSiblingNames.length > 0 ? input.existingSiblingNames.join("、") : "无"}`,
      "",
      "用户补充方向：",
      input.prompt?.trim() ? input.prompt.trim() : "无。请直接基于父类逻辑和现有兄弟节点进行衍生。",
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    if (output.length !== input.count) {
      throw new Error(`流派模式子类输出数量不正确，期望 ${input.count} 个，实际 ${output.length} 个。`);
    }

    const siblingNames = new Set(input.existingSiblingNames.map(normalizeNameKey));
    const batchNames = new Set<string>();

    for (const item of output) {
      if ((item.children ?? []).length > 0) {
        throw new Error("流派模式子类输出不能继续生成孙级节点。");
      }

      const generatedName = normalizeNameKey(item.name);

      if (generatedName === normalizeNameKey(input.parentName)) {
        throw new Error("流派模式子类输出重复了父类名称。");
      }

      if (siblingNames.has(generatedName)) {
        throw new Error("流派模式子类输出与现有兄弟节点重名。");
      }

      if (batchNames.has(generatedName)) {
        throw new Error("流派模式子类输出内部存在重名候选。");
      }

      batchNames.add(generatedName);
    }

    return output.map((item) => ({
      ...item,
      children: [],
    }));
  },
};