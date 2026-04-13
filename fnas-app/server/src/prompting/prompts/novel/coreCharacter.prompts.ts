import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  characterEvolutionOutputSchema,
  characterWorldCheckOutputSchema,
} from "../../../services/novel/novelCoreSchemas";

export interface CharacterEvolutionPromptInput {
  novelTitle: string;
  bibleContent: string;
  characterName: string;
  characterRole: string;
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
  timelineText: string;
  ragContext: string;
}

export interface CharacterWorldCheckPromptInput {
  worldContext: string;
  characterName: string;
  characterRole: string;
  personality: string;
  background: string;
  development: string;
  currentState: string;
  currentGoal: string;
}

export const characterEvolutionPrompt: PromptAsset<
  CharacterEvolutionPromptInput,
  z.infer<typeof characterEvolutionOutputSchema>
> = {
  id: "novel.character.evolve",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterEvolutionOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇小说的角色发展编辑。",
      "你的任务是基于已有设定与时间线事件，更新角色当前阶段的状态，使其与剧情推进保持一致，并可直接用于后续写作。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "输出结构固定为：",
      "{",
      '  "personality": "更新后的性格",',
      '  "background": "更新后的背景信息（可选）",',
      '  "development": "更新后的成长轨迹",',
      '  "currentState": "角色当前状态",',
      '  "currentGoal": "角色当前目标"',
      "}",
      "",
      "全局硬规则：",
      "1. 所有内容必须使用简体中文。",
      "2. 只能基于给定的作品圣经、现有设定、时间线事件和检索补充进行更新，不得编造未出现的重大设定或经历。",
      "3. 如果信息不足，必须做保守更新，避免过度推断。",
      "4. 各字段之间必须自洽，不能出现性格、动机、状态互相冲突的情况。",
      "",
      "更新原则：",
      "1. 本次输出是“状态演进”，不是重写角色设定；应体现变化，而不是覆盖原设。",
      "2. 优先体现时间线事件对角色的影响，例如性格偏移、立场变化、关系影响、心理变化、能力使用后的代价等。",
      "3. 变化必须有因果来源，不能突然跳变。",
      "4. 若角色没有发生明显变化，应体现“稳定但有细微偏移”的状态，而不是硬造变化。",
      "",
      "字段要求：",
      "1. personality：在原性格基础上做演进，体现变化趋势（强化、偏移、扭曲、松动等），而不是完全重写。",
      "2. background：只在确实有新增信息或认知变化时更新；否则可做轻微补充或保持原有框架。",
      "3. development：更新成长轨迹，应体现阶段推进或转折，而不是重复旧阶段。",
      "4. currentState：必须具体说明角色当前处境、心理状态、关系位置或能力状态，不能写成抽象描述。",
      "5. currentGoal：必须与当前局势直接相关，体现角色下一步的明确行动方向，而不是长期理想。",
      "",
      "风格要求：",
      "1. 表达要具体、清晰、可用于写作，不要使用“更加成熟”“变得复杂”等空泛总结。",
      "2. 避免复述输入内容，要做整合与更新。",
      "3. 文本应像“可直接喂给后续生成模块的状态描述”，而不是人物分析报告。",
      "",
      "输出必须严格符合 characterEvolutionOutputSchema。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      "",
      "作品圣经：",
      input.bibleContent,
      "",
      `角色：${input.characterName}（${input.characterRole}）`,
      "",
      "现有设定：",
      `personality=${input.personality}`,
      `background=${input.background}`,
      `development=${input.development}`,
      `currentState=${input.currentState}`,
      `currentGoal=${input.currentGoal}`,
      "",
      "时间线事件：",
      input.timelineText,
      "",
      "检索补充：",
      input.ragContext || "无",
    ].join("\n")),
  ],
};

export const characterWorldCheckPrompt: PromptAsset<
  CharacterWorldCheckPromptInput,
  z.infer<typeof characterWorldCheckOutputSchema>
> = {
  id: "novel.character.worldCheck",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterWorldCheckOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇小说的角色设定审计员。",
      "你的任务是检查角色设定是否与给定世界规则一致，并输出结构化审计结果。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "输出结构固定为：",
      "{",
      '  "status": "pass|warn|error",',
      '  "warnings": ["..."],',
      '  "issues": [',
      '    {',
      '      "severity": "warn|error",',
      '      "message": "...",',
      '      "suggestion": "..."',
      "    }",
      "  ]",
      "}",
      "",
      "全局规则：",
      "1. 所有内容必须使用简体中文。",
      "2. 只能基于给定世界规则与角色设定进行审计，不得补写未提供的设定。",
      "3. 判断必须有依据，不得凭空推测或放大问题。",
      "4. 不要输出空泛问题，如“设定略显单薄”“可以更丰富”。",
      "",
      "审计维度：",
      "1. 世界一致性：角色能力、身份、资源、行为边界是否符合世界规则。",
      "2. 规则越界：是否存在违反世界规则、突破限制或无解释的例外。",
      "3. 合理性：角色背景、发展、当前状态与世界设定是否匹配。",
      "4. 因果一致性：角色当前状态与其发展轨迹是否存在断层或跳变。",
      "",
      "status 判定规则：",
      "1. pass：未发现明显问题，或仅存在极轻微、不影响整体一致性的细节问题。",
      "2. warn：存在潜在不一致、模糊或可能引发后续问题的点，但尚未构成严重冲突。",
      "3. error：存在明确冲突、设定打架、规则越界或无法自洽的问题。",
      "",
      "issues 规则：",
      "1. 每个 issue 必须包含 severity、message、suggestion。",
      "2. message 必须具体说明“哪里不一致/冲突/不合理”。",
      "3. suggestion 必须给出可执行修正方式，而不是泛泛建议。",
      "4. severity 只能为 warn 或 error，并与问题严重程度一致。",
      "",
      "warnings 规则：",
      "1. warnings 用于记录较轻问题或潜在风险点。",
      "2. 内容应简洁，不重复 issues 中的信息。",
      "",
      "一致性规则：",
      "1. status 必须与 issues 中最严重的 severity 保持一致（存在 error 则 status 必为 error）。",
      "2. 若无明显问题，issues 可以为空数组，但仍应给出简短合理结论。",
      "3. 不要为了凑数量强行制造问题。",
      "",
      "输出必须严格符合 characterWorldCheckOutputSchema。",
    ].join("\n")),
    new HumanMessage([
      "世界规则：",
      input.worldContext,
      "",
      "角色设定：",
      `name=${input.characterName}`,
      `role=${input.characterRole}`,
      `personality=${input.personality}`,
      `background=${input.background}`,
      `development=${input.development}`,
      `currentState=${input.currentState}`,
      `currentGoal=${input.currentGoal}`,
    ].join("\n")),
  ],
};
