import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import {
  characterCastAutoMembersResponseSchema,
  characterCastAutoRelationsResponseSchema,
} from "./characterPreparation.promptSchemas";

export interface CharacterCastAutoMembersPromptInput {}

export interface CharacterCastAutoRelationsPromptInput {
  storyInput: string;
  optionTitle: string;
  optionSummary: string;
  protagonistName: string;
  memberNames: string[];
  memberRosterText: string;
}

export const characterCastAutoMembersPrompt: PromptAsset<
  CharacterCastAutoMembersPromptInput,
  z.infer<typeof characterCastAutoMembersResponseSchema>
> = {
  id: "novel.character.castAuto.members",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
    requiredGroups: ["idea_seed", "protagonist_anchor", "output_policy"],
    preferredGroups: [
      "hidden_identity_anchor",
      "project_context",
      "book_contract",
      "macro_constraints",
      "world_stage",
      "forbidden_names",
    ],
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: characterCastAutoMembersResponseSchema,
  render: (_input, context) => [
    new SystemMessage([
      "你是长篇中文网文的角色阵容策划师，服务对象是不懂写作流程的新手用户。",
      "你的任务是先产出可直接落库的角色成员骨架，不要在这一步生成 relations。",
      "",
      "只返回严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "最终 JSON 只能包含：title、summary、whyItWorks、recommendedReason、members。",
      "",
      "硬规则：",
      "1. members 必须是 3-6 个角色。",
      "2. 必须有且只能有 1 个 protagonist。",
      "3. 每个角色都必须输出 gender，允许值只有 male、female、other、unknown。",
      "4. castRole 只能使用：protagonist, antagonist, ally, foil, mentor, love_interest, pressure_source, catalyst。",
      "5. name 只能写可直接进入正文的人名或稳定称谓，禁止功能位式名字。",
      "6. 如果故事存在隐藏身份、历史真名、伪装身份或终局身份反转，成员信息里必须显式承接这条线。",
      "7. 不要输出 relations，也不要在字段里假装塞关系数组。",
      "",
      "表达要求：",
      "1. 所有字段值使用简体中文。",
      "2. 除 summary、whyItWorks、recommendedReason 外，其余文本尽量控制在短句或短词组。",
      "3. storyFunction 要写职责，name 不承载功能说明。",
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文生成自动导演要直接采用的角色成员骨架。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【输出要求】",
      "- 只输出成员骨架，不输出 relations",
      "- protagonist 必须唯一且稳定",
      "- name 必须可直接入戏",
      "- 只输出严格 JSON",
    ].join("\n")),
  ],
  postValidate: (output) => {
    const protagonistCount = output.members.filter((member) => member.castRole === "protagonist").length;
    if (protagonistCount !== 1) {
      throw new Error(`成员骨架必须且只能包含 1 个 protagonist，当前为 ${protagonistCount} 个。`);
    }

    const seenNames = new Set<string>();
    for (const member of output.members) {
      const normalizedName = member.name.trim();
      if (seenNames.has(normalizedName)) {
        throw new Error(`成员骨架里出现了重复角色名：${member.name}`);
      }
      seenNames.add(normalizedName);
    }

    return output;
  },
};

export const characterCastAutoRelationsPrompt: PromptAsset<
  CharacterCastAutoRelationsPromptInput,
  z.infer<typeof characterCastAutoRelationsResponseSchema>
> = {
  id: "novel.character.castAuto.relations",
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
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: characterCastAutoRelationsResponseSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇中文网文的角色关系策划师。",
      "你的任务是基于已经锁定的成员名单，补出可直接落库的 relations。",
      "",
      "只返回严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "最终 JSON 只能包含 relations。",
      "",
      "硬规则：",
      "1. sourceName 和 targetName 必须逐字复用给定成员名单里的名字，不得改名、加括号说明、写别名或新增角色。",
      "2. 不得新增、删除或改写成员设定；你只负责关系层。",
      "3. 每条关系都必须连接两个不同角色，禁止自指关系。",
      "4. 不要输出重复关系对。",
      "5. relations 必须体现长期关系动力、冲突来源、信息不对称或下一步转折，不能写空话。",
      "6. 主角必须进入至少一条关系。",
      "",
      "表达要求：",
      "1. 所有字段值使用简体中文。",
      "2. 每条关系都要服务长篇推进，而不是一次性事件说明。",
    ].join("\n")),
    new HumanMessage([
      "请基于下面已经锁定的角色成员骨架生成 relations。",
      "",
      `【故事输入】\n${input.storyInput || "暂无"}`,
      "",
      `【阵容标题】\n${input.optionTitle}`,
      "",
      `【阵容摘要】\n${input.optionSummary}`,
      "",
      `【主角】\n${input.protagonistName}`,
      "",
      `【允许使用的角色名】\n${input.memberNames.join("、")}`,
      "",
      `【成员简表】\n${input.memberRosterText}`,
      "",
      "【输出要求】",
      "- 只输出 relations",
      "- 名字必须逐字复用给定名单",
      "- 不新增角色，不改成员设定",
      "- 只输出严格 JSON",
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    const allowedNames = new Set(input.memberNames.map((name) => name.trim()).filter(Boolean));
    const seenPairs = new Set<string>();
    let protagonistLinked = false;

    for (const relation of output.relations) {
      if (!allowedNames.has(relation.sourceName) || !allowedNames.has(relation.targetName)) {
        throw new Error(`relations 使用了未注册成员名：${relation.sourceName} -> ${relation.targetName}`);
      }
      if (relation.sourceName === relation.targetName) {
        throw new Error(`relations 出现了自指关系：${relation.sourceName}`);
      }

      const pairKey = `${relation.sourceName}=>${relation.targetName}`;
      if (seenPairs.has(pairKey)) {
        throw new Error(`relations 出现了重复关系对：${pairKey}`);
      }
      seenPairs.add(pairKey);

      if (relation.sourceName === input.protagonistName || relation.targetName === input.protagonistName) {
        protagonistLinked = true;
      }
    }

    if (input.protagonistName && !protagonistLinked) {
      throw new Error(`relations 必须显式包含主角「${input.protagonistName}」。`);
    }

    return output;
  },
};
