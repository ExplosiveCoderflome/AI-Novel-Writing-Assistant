import type {
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroLocks,
} from "@ai-novel/shared/types/storyMacro";

export function buildExpansionAndDecompositionPrompt(storyInput: string, projectContext = ""): { system: string; user: string } {
  return {
    system: [
      "你是资深小说作者 + 剧情策划编辑，你的任务不是润色想法，而是把用户的故事想法重构为具备持续叙事能力的「故事引擎原型」。",
      "核心要求：必须强化戏剧冲突；必须构建故事为什么能一直写下去的驱动力；必须控制信息密度；优先处理人物处境、认知冲突、危机升级、关键场面；输出会作为后续生成的硬约束。",
      "当前阶段位于角色创建之前，只允许使用主角位、对立位、关系压力位等抽象角色槽位。禁止出现具体角色姓名、完整人物小传、固定角色清单。",
      "你必须完成：把主角困住；构建一个持续升级的核心矛盾；设置信息不对称 / mystery box；设计 2-3 个高张力场面；明确叙事气质。",
      "如果题材呈现克苏鲁 / 不可名状倾向，必须体现认知崩塌、现实不可信、真相不可直视。",
      "如果题材呈现悬疑 / 推理倾向，必须体现信息揭示节奏。",
      "如果题材呈现成长倾向，必须体现阶段性认知变化。",
      "不要无依据地扩展大量世界观，不要把设定说明写成主要内容。",
      "如果项目上下文里包含『这本书会用到的世界设定』，必须优先使用其中的规则、组织、地点、冲突和边界；不要越出这个范围乱扩写。",
      "如果故事想法与这些世界边界或禁配明显冲突，必须在 issues 中标记 conflict。",
      "如果信息不足，在 issues 中标记 missing_info；如果用户输入存在冲突，在 issues 中标记 conflict。",
      "输出必须是严格合法的 JSON 对象，不要输出解释文字。",
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

export function buildFieldRegenerationPrompt(input: {
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
      "你是小说故事引擎规划助手，只能重写一个指定字段，其他字段只是上下文。",
      "当前阶段位于角色创建之前，禁止输出具体角色姓名、详细人物设定和角色清单。",
      "如果项目上下文包含『这本书会用到的世界设定』，重写时必须保持和其中规则、地点、势力、边界一致。",
      "输出必须是严格合法的 JSON 对象，不要输出解释。",
      `目标字段：${input.field}`,
      `输出格式：${fieldFormat}`,
    ].join("\n"),
    user: [
      input.projectContext ? `项目上下文：\n${input.projectContext}` : "",
      `原始故事想法：\n${input.storyInput}`,
      input.expansion ? `故事引擎原型：\n${JSON.stringify(input.expansion, null, 2)}` : "",
      `推进与兑现摘要：\n${JSON.stringify(input.decomposition, null, 2)}`,
      `硬约束：\n${JSON.stringify(input.constraints, null, 2)}`,
      `已锁定字段：\n${JSON.stringify(input.lockedFields, null, 2)}`,
      `请只重写字段 ${input.field}。`,
    ].filter(Boolean).join("\n\n"),
  };
}
