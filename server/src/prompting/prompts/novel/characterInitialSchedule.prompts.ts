import {HumanMessage, SystemMessage} from "@langchain/core/messages";
import {z} from "zod";
import type {PromptAsset} from "../../core/promptTypes";

const outputSchema = z.object({chapters:z.array(z.object({
  planId:z.string().trim().min(1), plannedCharacterIds:z.array(z.string().trim().min(1)).max(100),
})).min(1).max(24)});
export interface CharacterInitialScheduleInput {
  title:string;
  characters:Array<{id:string;name:string;role:string;castRole:string|null}>;
  chapters:Array<{id:string;chapterOrder:number;title:string;summary:string;beatKey?:string|null;volumeTitle:string;volumeSummary:string|null}>;
  neighbors:Array<{chapterOrder:number;plannedCharacterIds:string[]}>;
}

export const characterInitialSchedulePrompt: PromptAsset<CharacterInitialScheduleInput,z.infer<typeof outputSchema>> = {
  id:"novel.character.initial_schedule",version:"v1",taskType:"planner",mode:"structured",language:"zh",
  contextPolicy:{maxTokensBudget:8000},outputSchema,
  render: input => [
    new SystemMessage([
      "你是长篇网文的角色出场排期编辑。依据已有章节规划补齐现场出场名单，保留原剧情，不写正文，不改标题摘要，不扩写任务单。",
      "输出严格 JSON：{chapters:[{planId,plannedCharacterIds}]}。逐章返回，计划 ID 必须和输入一致且不可遗漏或重复。",
      "只使用角色目录中的 ID，不能新建角色。数组安排本章真实参与行动、对话或现场观察的人物；仅提及、回忆、梦境不算现场出场。",
      "根据人物职能、主角视角、对手施压、导师引导、关系变化和伏笔节奏安排登场、暂离、重逢。避免全员铺满；无人现场出场可以输出 []。",
      "摘要是剧情依据，但不要机械照抄出现的名字；参与核心冲突的已有角色也需要安排。相邻已排章节是连续性约束，不更改它们。",
      "示例格式：{\"chapters\":[{\"planId\":\"p1\",\"plannedCharacterIds\":[\"c1\",\"c2\"]},{\"planId\":\"p2\",\"plannedCharacterIds\":[]}]}。示例 ID 不能用于实际输出。",
    ].join("\n")),
    new HumanMessage(`本书：${input.title}\n角色目录：${JSON.stringify(input.characters)}`),
    new HumanMessage(`待补齐章节：${JSON.stringify(input.chapters)}\n相邻已排章节：${JSON.stringify(input.neighbors)}`),
  ],
  postValidate: (output, input) => {
    const expected=new Set(input.chapters.map(chapter=>chapter.id));
    const allowed=new Set(input.characters.map(character=>character.id));
    if(output.chapters.length!==expected.size || new Set(output.chapters.map(chapter=>chapter.planId)).size!==expected.size
      || output.chapters.some(chapter=>!expected.has(chapter.planId))) throw new Error("角色出场排期必须完整覆盖指定章节，不能遗漏、重复或越界。");
    if(output.chapters.some(chapter=>new Set(chapter.plannedCharacterIds).size!==chapter.plannedCharacterIds.length
      || chapter.plannedCharacterIds.some(id=>!allowed.has(id)))) throw new Error("角色出场排期只能使用本书角色目录中的 ID，不能重复。");
    return output;
  },
};
