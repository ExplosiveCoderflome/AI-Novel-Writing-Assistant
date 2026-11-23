import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import {
  characterProfileLabels, characterProfileReply, characterProfileValueIssue, type CharacterProfileDraft,
} from "@ai-novel/shared/types/director/characterProfile";
import type { PromptAsset } from "../../../core/promptTypes";

interface CharacterProfileDialogueInput {
  storyInput: string;
  character: CharacterProfileDraft;
  otherNames: string[];
  renameBlockedReason: string | null;
  requestText: string;
  history: {author: string; assistant: string | null}[];
  priorProposal: unknown;
}

export const characterProfileDialoguePrompt: PromptAsset<CharacterProfileDialogueInput, z.infer<typeof characterProfileReply>> = {
  id: "novel.director.character_profile_dialogue", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 12000 }, outputSchema: characterProfileReply,
  render: input => [
    new SystemMessage([
      "你与作者一起编辑这一本小说当前选中的角色。根据故事、当前编辑稿和作者意图讨论；如果作者只是提问，changes 留空。",
      "有明确修改意图时，每项建议给出一项字段的完整新值和理由。只改当前角色，保留作者未要求变更的设定与关系。关联影响可以在回复中指出。",
      "renameBlockedReason 非空时，说明该角色姓名的修改条件，勿提出 name 变更。可以改名时，避开本书其他人物的姓名。",
      "建议只进入作者的编辑稿。作者选择并保存后才成为本书资料。不要声称已修改正文、计划或其他人物。",
      "可提议的资料字段：" + JSON.stringify(characterProfileLabels),
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ],
  postValidate: (output, input) => {
    for (const {field, value} of output.changes) {
      const issue = characterProfileValueIssue(field, value);
      if (issue) throw new Error(issue);
      if (field === "name") {
        if (input.renameBlockedReason) throw new Error(input.renameBlockedReason);
        if (input.otherNames.includes(value)) throw new Error("请为本书角色选用不同的姓名。");
      }
    }
    return output;
  },
};
