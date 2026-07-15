import type { BaseCharacter } from "@ai-novel/shared/types/novelCharacter";
import type { CharacterSubjectProjection } from "@ai-novel/shared/types/characterConversation";
import type { CharacterSubjectAdapter } from "./types";

export interface BaseCharacterSubjectAdapterInput {
  character: BaseCharacter;
}

const PROMPT_FIELD_LIMIT = 420;

function compact(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  return text.length > PROMPT_FIELD_LIMIT ? `${text.slice(0, PROMPT_FIELD_LIMIT)}…` : text;
}

function present(label: string, value: string | null | undefined): string | null {
  const text = compact(value);
  return text ? `${label}：${text}` : null;
}

/**
 * Projects a library template as a read-only conversational subject. It has
 * no novel scope and intentionally does not manufacture a current plot state.
 */
export const baseCharacterSubjectAdapter: CharacterSubjectAdapter<BaseCharacterSubjectAdapterInput> = {
  project({ character }): CharacterSubjectProjection {
    const stableDetails = [
      present("性格", character.personality),
      present("背景", character.background),
      present("发展方向", character.development),
      present("弱点", character.weaknesses),
      present("兴趣", character.interests),
      present("关键经历", character.keyEvents),
    ].filter((item): item is string => Boolean(item));

    return {
      subject: {
        kind: "base_character",
        id: character.id,
        scopeKind: "base_library",
        scopeId: null,
      },
      name: character.name,
      role: character.role,
      sourceLabel: "基础角色库",
      sourceDescription: "依据角色库中保存的稳定人物设定回应；交流只用于理解人物，不会改写角色库设定。",
      interactionPolicy: "read_only",
      identity: stableDetails.join("\n") || `角色定位：${character.role}`,
      currentSituation: "这是一个可复用的角色原型，未绑定任何小说、章节或当前剧情处境。",
      hardBoundaries: [
        "只能依据基础角色库中的稳定设定回应，不能虚构某部小说中的既有经历。",
        "交流是只读访谈，不会自动修改角色库、创建版本或影响任何小说正文。",
      ],
      subjectiveState: null,
      evidence: [
        {
          label: "基础角色库设定",
          detail: `角色库条目“${character.name}”的当前稳定设定。`,
          sourceType: "base_character",
          sourceRef: character.id,
          chapterOrder: null,
        },
      ],
      chapterAnchor: null,
      chapterAnchorLabel: null,
    };
  },

  buildPromptContext({ character }): string {
    return [
      "角色来源：基础角色库（只读访谈）",
      `姓名：${compact(character.name)}`,
      `角色定位：${compact(character.role)}`,
      present("性格", character.personality),
      present("背景", character.background),
      present("发展方向", character.development),
      present("外形", character.appearance),
      present("弱点", character.weaknesses),
      present("兴趣", character.interests),
      present("关键经历", character.keyEvents),
      character.tags.trim() ? `标签：${compact(character.tags)}` : null,
      "边界：未绑定小说情节；不得把交流内容当成已发生事实，也不得提出或写入角色库修改。",
    ].filter((line): line is string => Boolean(line)).join("\n");
  },
};
