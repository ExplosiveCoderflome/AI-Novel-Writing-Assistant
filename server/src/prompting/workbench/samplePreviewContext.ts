import { createContextBlock } from "../core/contextBudget";
import { getRequiredTemplateContextGroups } from "../templates/templateTypes";

// Fictional fixtures for the workbench only. Never use these in production context assembly.
const SAMPLE_CONTEXT: Record<string, string> = {
  book_contract: "示例小说《旧城暗号》：调查员林澈追查旧城失踪案，逐步揭开暗号网络的秘密。",
  chapter_mission: "林澈在旧仓库发现墙上的暗号，判断它指向档案站；门外脚步逼近，他必须带走线索。",
  reader_experience: "读者随主角发现线索，感受被追踪的压力，并期待下一章调查档案站。",
  character_hard_facts: "林澈：年轻调查员，不知道幕后主使是谁。沈雾：线索提供者，本章未在场。",
  obligation_contract: "本章兑现暗号的初步含义，保留幕后主使的悬念，不提前揭晓最终真相。",
  volume_window: "故事开篇：发现线索、离开仓库、调查档案站。本章只推进发现线索这一阶段。",
  participant_subset: "出场人物为林澈；门外追踪者身份未知，不引入额外主要人物。",
  local_state: "林澈独自在仓库，尚未取得证据；追踪者正在门外，出口可能被封锁。",
  style_contract: "第三人称有限视角，动作清晰，对白克制，以具体细节表现紧张。",
  writing_platform: "通用小说阅读场景，优先保证情节连贯和阅读流畅。",
  creation_intent: "示例短篇《沉默证词》：能听见谎言的女孩遇见唯一无法判断真假的证人。",
  production_foundation: "现代悬疑短篇，主要人物为女孩与证人，核心场景为旧城调查现场。",
  short_story_plan: "女孩发现能力失效，被迫与证人合作，在危险中验证线索，最终揭开失效的原因。当前为开场片段。",
  short_story_continuity: "故事从女孩第一次听不见谎言开始；两人尚未信任对方，也没有共同经历。",
  book_style: "悬疑与信任，快速开场，连续揭示，以人物行动推进关系。",
};

export function buildSampleTemplatePreviewBlocks(promptId: string, requiredGroups: string[]) {
  const groups = [...new Set([...getRequiredTemplateContextGroups(promptId), ...requiredGroups])];
  return groups.map((group) => createContextBlock({
    id: group,
    group,
    content: SAMPLE_CONTEXT[group],
    required: true,
    priority: 100,
  }));
}
