import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { validateNamingCandidates } from "./characterNaming.constraints";
import {
  characterNamingCandidatesOutputSchema,
  type CharacterNamingCandidatesOutput,
  type CharacterNamingCandidatesPromptInput,
} from "./characterNaming.promptSchemas";

const PREFERENCE_TEXT: Record<CharacterNamingCandidatesPromptInput["constraints"]["preference"], string> = {
  plain: "平实：优先朴素、常见、符合出身的名字。",
  balanced: "平衡：以符合出身的常见名为主，可以有一两个带含义的选择。",
  meaningful: "有寓意：可以多给带含义的名字，但仍须符合人物的时代、地域和家庭。",
};

function line(label: string, value: string | null | undefined): string {
  return `${label}：${value && value.trim() ? value.trim() : "未提供"}`;
}

function renderConstraints(input: CharacterNamingCandidatesPromptInput): string[] {
  const { constraints } = input;
  return [
    line("固定姓氏", constraints.fixedSurname),
    constraints.generationChar
      ? `字辈：「${constraints.generationChar.char}」，必须是名（不含姓）的第 ${constraints.generationChar.position} 个字`
      : "字辈：无",
    `禁用名：${constraints.forbiddenNames.length > 0 ? constraints.forbiddenNames.join("、") : "无"}`,
    `禁用字：${constraints.forbiddenChars.length > 0 ? constraints.forbiddenChars.join("、") : "无"}`,
    `取名倾向：${PREFERENCE_TEXT[constraints.preference]}`,
  ];
}

export const characterNamingCandidatesPrompt: PromptAsset<
  CharacterNamingCandidatesPromptInput,
  CharacterNamingCandidatesOutput
> = {
  id: "character.naming.candidates",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: characterNamingCandidatesOutputSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => {
    const { character, namingBackground } = input;
    return [
      new SystemMessage([
        "你是熟悉中文及多种语言文化命名习惯的小说人物取名顾问。为一个人物给出若干可供作者挑选的名字候选，作者自行决定是否采用。",
        "",
        "取名原则：",
        "1. 先理解人物出生与成长的年代、地域、语言文化、年龄、家庭和在故事中的作用，再取名。名字首先要像这个人在那个年代、那个家庭里真会被取的名字。",
        "2. 跨时代作品按人物自己的出生和成长年代判断，不按故事发生的年代统一取名；同一家庭里长辈与晚辈的名字可以带出时代差异。",
        "3. 大多数人物适合符合出身的常见名或朴素名。只有叙事确实需要时才用寓意明显的名字，并在 rationale.storyRole 写清需要的理由。不得让所有候选都华丽、生僻或寓意化。",
        "4. 少数民族、海外华人、外语转写等，遵循该语言文化的命名习惯和通行转写；没有姓氏传统时 surname 写空串，givenName 写完整的名。",
        "5. 名字必须是真正的人名。禁止截取人物描述、身份、职业或外号充当名字，禁止用“老板”“女孩”这类功能词。",
        "6. 候选之间在读音、字形与风格上要有区分，也要与已有角色名明显区分；distinction 写清这个候选与其他候选、已有角色的区别。",
        "7. readingRisks 如实指出同音或谐音歧义（homophone）、形近（similar_glyph）、与已有角色过近（too_close_to_cast）、象征过重（over_symbolic）、生僻字（rare_character）等阅读风险；没有就给空数组，不要回避。",
        "8. 用户约束必须严格满足：固定姓氏写入 surname；字辈放在指定位置；不得使用禁用名和禁用字；不得与已有角色名重复。",
        "9. keepCurrentName：如果现名已经贴合人物，可以建议保留并说明理由，朴素的现名同样可以是好名字；只有现名满足明确约束才建议保留，并提供现名真实的 surname 和 givenName，不得为满足约束重写这些部分；昵称可列入 appellations。没有现名时 recommended 为 false。候选里不要重复现名。",
        "10. 不借用知名作品人物名或在世公众人物的姓名。",
        "11. appellations 写这个人在家里和日常中会被怎么称呼（小名、昵称、职务称呼等），符合其地域和家庭；没有就给空数组。",
        "12. register：plain 表示朴素，common 表示同代人常见，meaningful 表示寓意明显。",
        "",
        `输出恰好 ${input.candidateCount} 个候选。只输出一个 JSON 对象，不要输出 Markdown 或解释。`,
        "JSON 结构：",
        "{",
        '  "keepCurrentName": { "recommended": false, "reason": "...", "surname": "现名真实姓氏（建议保留时提供）", "givenName": "现名真实的名（建议保留时提供）" },',
        '  "candidates": [',
        "    {",
        '      "name": "完整姓名", "surname": "姓，可为空串", "givenName": "名",',
        '      "register": "plain | common | meaningful",',
        '      "appellations": ["..."],',
        '      "rationale": { "era": "...", "region": "...", "languageCulture": "...", "ageAndFamily": "...", "storyRole": "..." },',
        '      "readingRisks": [{ "type": "homophone | similar_glyph | too_close_to_cast | over_symbolic | rare_character | other", "detail": "..." }],',
        '      "distinction": "..."',
        "    }",
        "  ]",
        "}",
      ].join("\n")),
      new HumanMessage([
        "【书级命名背景】",
        line("时代", namingBackground?.era),
        line("地域", namingBackground?.region),
        line("语言文化", namingBackground?.languageCulture),
        line("家族或命名习惯", namingBackground?.familyConventions),
        "",
        "【人物】",
        line("现名", character.currentName),
        line("在故事中的作用", character.role),
        line("性别", character.gender),
        line("年龄或出生、成长年代", character.ageOrBirthEra),
        line("出生或成长地", character.hometown),
        line("家庭背景", character.familyBackground),
        line("人物描述（只作依据，不能截取为名字）", character.description),
        "",
        "【用户约束】",
        ...renderConstraints(input),
        "",
        `【已有角色名】${input.existingCastNames.length > 0 ? input.existingCastNames.join("、") : "无"}`,
        "",
        line("【故事背景】", input.storyContext),
      ].join("\n")),
    ];
  },
  postValidate: (output, input) => validateNamingCandidates(output, input),
};
