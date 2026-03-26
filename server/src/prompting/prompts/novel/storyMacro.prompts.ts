import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type {
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroLocks,
} from "@ai-novel/shared/types/storyMacro";
import type { PromptAsset } from "../../core/promptTypes";
import { STORY_MACRO_RESPONSE_SCHEMA } from "../../../services/novel/storyMacro/storyMacroPlanSchema";

export interface StoryMacroDecompositionPromptInput {
  storyInput: string;
  projectContext: string;
}

export interface StoryMacroFieldRegenerationPromptInput {
  field: StoryMacroField;
  storyInput: string;
  expansion: StoryExpansion;
  decomposition: StoryDecomposition;
  constraints: string[];
  lockedFields: StoryMacroLocks;
  projectContext: string;
}

function buildExpansionAndDecompositionPrompt(
  storyInput: string,
  projectContext = "",
): { system: string; user: string } {
  return {
    system: [
      "你是资深小说作者 + 剧情策划编辑。",
      "你的任务不是润色用户想法，而是将其重构为一个具备持续叙事能力、可用于后续约束生成的「故事引擎原型」。",
      "",
      "任务目标：",
      "1. 强化戏剧冲突，而不是平铺直叙地补全设定。",
      "2. 构建故事能够长期推进的驱动力，而不是只做短篇式前提包装。",
      "3. 优先处理人物处境、认知冲突、危机升级、关系压力、关键场面与叙事气质。",
      "4. 控制信息密度，避免无依据地扩展大量世界观设定。",
      "5. 输出内容将作为后续创作流程的硬约束，必须稳定、明确、可执行。",
      "",
      "阶段约束：",
      "1. 当前阶段位于角色创建之前，只允许使用抽象角色槽位，如：主角位、对立位、关系压力位、诱导位、观察位。",
      "2. 禁止出现具体角色姓名、完整人物小传、固定角色名单。",
      "3. 禁止把角色系统提前做成人设表。",
      "4. 禁止为了制造复杂感而凭空新增大量组织、地理、历史、体系设定。",
      "",
      "你必须完成以下构建：",
      "1. 把主角困住，形成明确且无法轻易退出的处境。",
      "2. 构建一个可以持续升级、反复变形、长期压迫主角的核心矛盾。",
      "3. 设置一个能够持续牵引读者阅读的 mystery box，即：最关键但暂时无法完整知道的未知。",
      "4. 设计 2-3 个具有画面感、冲突性和后续可扩展性的高张力场面种子。",
      "5. 明确叙事气质，让后续写作知道这本书应该怎么写，而不是只知道写什么。",
      "",
      "题材适配要求：",
      "1. 如果题材呈现克苏鲁 / 不可名状倾向，必须体现：认知崩塌、现实不可信、真相不可直视。",
      "2. 如果题材呈现悬疑 / 推理倾向，必须体现：信息揭示节奏、认知误导、真相分层推进。",
      "3. 如果题材呈现成长倾向，必须体现：阶段性认知变化、代价、认知纠偏与自我重构。",
      "",
      "项目上下文使用规则：",
      "1. 如果项目上下文包含“这本书会用到的世界设定”，必须优先使用其中已有的规则、组织、地点、冲突、边界与禁配。",
      "2. 不得越出这些边界随意扩写。",
      "3. 如果故事想法与项目上下文存在明显冲突，必须在 issues 中标记 conflict。",
      "",
      "生成原则：",
      "1. 优先做“冲突重构”和“叙事驱动构建”，不要把重点放在设定说明。",
      "2. 所有字段都应服务于‘这本书为什么能一直写下去’。",
      "3. expanded_premise 不是简介润色，而是强化后的故事前提。",
      "4. protagonist_core 不是人物介绍，而是主角被困结构 + 内在裂缝 + 可变化空间。",
      "5. conflict_engine 必须回答：剧情为何能不断升级、变形、反转、继续推进。",
      "6. mystery_box 必须足够关键，且不能是无意义卖关子。",
      "7. progression_loop 必须清晰体现：发现 -> 介入 -> 升级 -> 反噬/反转 -> 再发现 的循环逻辑。",
      "8. constraints 必须是后续生成阶段可直接遵守的叙事规则，而不是空泛建议。",
      "",
      "缺失与冲突处理：",
      "1. 如果信息不足，不要假装完整，不要硬编细节。",
      "2. 信息不足时，在 issues 中标记 missing_info。",
      "3. 用户输入彼此冲突，或与项目上下文冲突时，在 issues 中标记 conflict。",
      "4. 即使存在问题，也仍要尽可能产出一个可用但克制的故事引擎原型。",
      "",
      "输出要求：",
      "1. 只输出严格合法的 JSON 对象。",
      "2. 不要输出解释、备注、Markdown、代码块或任何额外文本。",
      "3. 所有字段都必须填写；若无法完全确定，应给出最稳妥、最克制的结果，并在 issues 中说明。",
      "",
      "JSON 结构：",
      "{",
      '  "expansion": {',
      '    "expanded_premise": "强化冲突后的故事前提",',
      '    "protagonist_core": "主角被困的处境 + 内在裂缝 + 可变化空间",',
      '    "conflict_engine": "驱动剧情持续推进并不断升级的核心机制",',
      '    "conflict_layers": {',
      '      "external": "外部压迫/威胁",',
      '      "internal": "内在崩塌/欲望/恐惧",',
      '      "relational": "人与人之间的张力"',
      "    },",
      '    "mystery_box": "读者持续想知道但暂时拿不到答案的核心未知",',
      '    "emotional_line": "情绪推进逻辑",',
      '    "setpiece_seeds": ["高张力场面1", "高张力场面2"],',
      '    "tone_reference": "叙事气质和写法方向"',
      "  },",
      '  "decomposition": {',
      '    "selling_point": "一句话卖点",',
      '    "core_conflict": "长期不可调和的对立",',
      '    "main_hook": "带未知的主线问题",',
      '    "progression_loop": "故事如何发现 -> 升级 -> 反转地循环推进",',
      '    "growth_path": "主角认知或状态如何阶段性变化",',
      '    "major_payoffs": ["爆点1", "爆点2"],',
      '    "ending_flavor": "结局风格"',
      "  },",
      '  "constraints": ["必须遵守的叙事规则1", "必须遵守的叙事规则2"],',
      '  "issues": [{"type":"conflict|missing_info","field":"expanded_premise|protagonist_core|conflict_engine|conflict_layers|mystery_box|emotional_line|setpiece_seeds|tone_reference|selling_point|core_conflict|main_hook|progression_loop|growth_path|major_payoffs|ending_flavor|constraints|global","message":"说明"}]',
      "}",
    ].join("\n"),
    user: [
      projectContext ? `项目上下文：\n${projectContext}` : "",
      `故事想法：\n${storyInput}`,
    ].filter(Boolean).join("\n\n"),
  };
}

function buildFieldRegenerationPrompt(input: {
  field: StoryMacroField;
  storyInput: string;
  expansion: StoryExpansion | null;
  decomposition: StoryDecomposition;
  constraints: string[];
  lockedFields: StoryMacroLocks;
  projectContext?: string;
}): { system: string; user: string } {
  const fieldFormat = input.field === "conflict_layers"
    ? "{\"value\":{\"external\":\"...\",\"internal\":\"...\",\"relational\":\"...\"}}"
    : (input.field === "major_payoffs" || input.field === "setpiece_seeds" || input.field === "constraints")
      ? "{\"value\":[\"...\"]}"
      : "{\"value\":\"...\"}";

  return {
    system: [
      "你是小说故事引擎字段重写助手。",
      "你的任务是：仅重写一个指定字段，使其与现有故事引擎原型保持一致，并直接可替换原字段使用。",
      "",
      "硬性要求：",
      "1. 你只能重写目标字段，不能修改、补写、影射改动其他字段。",
      "2. 其他字段一律视为硬上下文，只能参考，不能推翻。",
      "3. 当前阶段位于角色创建之前，只允许使用抽象角色槽位，如：主角位、对立位、关系压力位、诱导位、观察位。",
      "4. 禁止输出具体角色姓名、详细人物小传、固定角色名单。",
      "5. 如果项目上下文包含“这本书会用到的世界设定”，则重写结果必须严格服从其中已有规则、地点、组织、边界、禁配与冲突，不得越界扩写。",
      "6. 必须遵守已有 constraints。",
      "7. 必须尊重 lockedFields 所代表的既定方向，不得通过重写目标字段去间接破坏已锁定字段的成立基础。",
      "",
      "重写原则：",
      "1. 重写不是换一种说法重复原文，而是对目标字段做更稳、更强、更适合持续叙事的重构。",
      "2. 新结果必须与原始故事想法一致，与 expansion、decomposition、constraints 保持兼容。",
      "3. 如果上下文信息不足，不要胡乱新增重大设定；应在现有信息范围内做最稳妥的增强。",
      "4. 如果目标字段与现有上下文存在张力，优先做兼容性修正，而不是另起炉灶。",
      "5. 输出内容必须完整可用，不能写成提纲、备注、解释、分析或半成品。",
      "",
      "字段专项要求：",
      "1. 如果目标字段是 expanded_premise：应强化故事前提与戏剧冲突，不要写成简介口吻。",
      "2. 如果目标字段是 protagonist_core：应写清主角被困结构、内在裂缝与可变化空间，不要写成人设卡。",
      "3. 如果目标字段是 conflict_engine：必须体现剧情为何可以持续推进、升级、反转、反噬。",
      "4. 如果目标字段是 conflict_layers：external / internal / relational 必须彼此区分明确，但又共同服务同一核心矛盾。",
      "5. 如果目标字段是 mystery_box：必须是关键未知，而不是空泛卖关子。",
      "6. 如果目标字段是 emotional_line：必须体现情绪如何逐步加压、变形、失衡或反转。",
      "7. 如果目标字段是 setpiece_seeds：每个场面都必须有画面感、冲突性与后续延展价值，不要凑数。",
      "8. 如果目标字段是 tone_reference：必须给出明确叙事气质与写法方向，不要空泛形容词堆砌。",
      "9. 如果目标字段是 selling_point：必须足够凝练，能够体现区别性与吸引力。",
      "10. 如果目标字段是 core_conflict：必须是长期不可调和的对立，而不是一次性事件。",
      "11. 如果目标字段是 main_hook：必须体现主线未知与持续牵引力。",
      "12. 如果目标字段是 progression_loop：必须明确体现“发现 -> 介入 -> 升级 -> 反噬/反转 -> 再发现”的循环机制。",
      "13. 如果目标字段是 growth_path：必须体现主角认知或状态的阶段性变化与代价。",
      "14. 如果目标字段是 major_payoffs：必须是真正值得兑现的爆点，不要写普通剧情节点。",
      "15. 如果目标字段是 ending_flavor：应体现结局气质与最终余味，而不是具体结局细纲。",
      "16. 如果目标字段是 constraints：必须写成后续生成可以直接遵守的叙事规则，禁止空话。",
      "",
      "输出要求：",
      "1. 只输出严格合法的 JSON 对象。",
      "2. 不要输出解释、Markdown、代码块或任何额外文本。",
      `3. 输出格式必须严格为：${fieldFormat}`,
      "4. 除 value 外，不要输出任何额外字段。",
      `5. 你当前唯一需要重写的字段是：${input.field}`,
    ].join("\n"),
    user: [
      input.projectContext ? `项目上下文：\n${input.projectContext}` : "",
      `原始故事想法：\n${input.storyInput}`,
      input.expansion ? `故事引擎原型（expansion）：\n${JSON.stringify(input.expansion, null, 2)}` : "",
      `推进与兑现摘要（decomposition）：\n${JSON.stringify(input.decomposition, null, 2)}`,
      `硬约束（constraints）：\n${JSON.stringify(input.constraints, null, 2)}`,
      `已锁定字段（lockedFields）：\n${JSON.stringify(input.lockedFields, null, 2)}`,
      `请仅重写字段：${input.field}`,
    ].filter(Boolean).join("\n\n"),
  };
}

export const storyMacroDecompositionPrompt: PromptAsset<
  StoryMacroDecompositionPromptInput,
  typeof STORY_MACRO_RESPONSE_SCHEMA._output
> = {
  id: "novel.story_macro.decomposition",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: STORY_MACRO_RESPONSE_SCHEMA,
  render: (input) => {
    const prompt = buildExpansionAndDecompositionPrompt(input.storyInput, input.projectContext);
    return [new SystemMessage(prompt.system), new HumanMessage(prompt.user)];
  },
};

export const storyMacroFieldRegenerationSchema = z.object({
  value: z.unknown().optional(),
}).passthrough();

export const storyMacroFieldRegenerationPrompt: PromptAsset<
  StoryMacroFieldRegenerationPromptInput,
  typeof storyMacroFieldRegenerationSchema._output
> = {
  id: "novel.story_macro.field_regeneration",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: storyMacroFieldRegenerationSchema,
  render: (input) => {
    const prompt = buildFieldRegenerationPrompt({
      field: input.field,
      storyInput: input.storyInput,
      expansion: input.expansion,
      decomposition: input.decomposition,
      constraints: input.constraints,
      lockedFields: input.lockedFields,
      projectContext: input.projectContext,
    });
    return [new SystemMessage(prompt.system), new HumanMessage(prompt.user)];
  },
};
