import {
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorCorrectionPreset,
  type DirectorProjectContextInput,
} from "@ai-novel/shared/types/novelDirector";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";

function formatProjectContext(input: DirectorProjectContextInput): string {
  const lines = [
    input.title?.trim() ? `当前标题草案：${input.title.trim()}` : "",
    input.description?.trim() ? `当前一句话概述：${input.description.trim()}` : "",
    input.genreId?.trim() ? `类型 ID：${input.genreId.trim()}` : "",
    input.worldId?.trim() ? `世界观 ID：${input.worldId.trim()}` : "",
    input.writingMode ? `创作模式：${input.writingMode}` : "",
    input.projectMode ? `项目模式：${input.projectMode}` : "",
    input.narrativePov ? `叙事视角：${input.narrativePov}` : "",
    input.pacePreference ? `节奏偏好：${input.pacePreference}` : "",
    input.styleTone?.trim() ? `文风关键词：${input.styleTone.trim()}` : "",
    input.emotionIntensity ? `情绪浓度：${input.emotionIntensity}` : "",
    input.aiFreedom ? `AI 自由度：${input.aiFreedom}` : "",
    typeof input.defaultChapterLength === "number" ? `默认章节字数：${input.defaultChapterLength}` : "",
    typeof input.estimatedChapterCount === "number" ? `预计章节数：${input.estimatedChapterCount}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatPresetHints(presets: DirectorCorrectionPreset[]): string {
  if (presets.length === 0) {
    return "无预设修正。";
  }
  return presets.map((preset) => {
    const meta = DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset);
    return meta ? `${meta.label}：${meta.promptHint}` : preset;
  }).join("\n");
}

function formatCandidateDigest(candidate: DirectorCandidate, index: number): string {
  return [
    `方案 ${index + 1}：${candidate.workingTitle}`,
    `一句话：${candidate.logline}`,
    `定位：${candidate.positioning}`,
    `卖点：${candidate.sellingPoint}`,
    `冲突：${candidate.coreConflict}`,
    `主角路径：${candidate.protagonistPath}`,
    `主钩子：${candidate.hookStrategy}`,
    `结局方向：${candidate.endingDirection}`,
  ].join("\n");
}

function formatLatestBatchDigest(batches: DirectorCandidateBatch[]): string {
  const latestBatch = batches.at(-1);
  if (!latestBatch) {
    return "无上一轮候选。";
  }
  return [
    `${latestBatch.roundLabel}：${latestBatch.refinementSummary?.trim() || "上一轮候选"}`,
    ...latestBatch.candidates.map((candidate, index) => formatCandidateDigest(candidate, index)),
  ].join("\n\n");
}

function formatStoryMacroSummary(plan: StoryMacroPlan): string {
  const lines = [
    plan.expansion?.expanded_premise ? `扩展前提：${plan.expansion.expanded_premise}` : "",
    plan.expansion?.protagonist_core ? `主角核心：${plan.expansion.protagonist_core}` : "",
    plan.expansion?.conflict_engine ? `冲突引擎：${plan.expansion.conflict_engine}` : "",
    plan.expansion?.mystery_box ? `悬念盒：${plan.expansion.mystery_box}` : "",
    plan.decomposition?.selling_point ? `卖点拆解：${plan.decomposition.selling_point}` : "",
    plan.decomposition?.core_conflict ? `主线冲突：${plan.decomposition.core_conflict}` : "",
    plan.decomposition?.progression_loop ? `推进循环：${plan.decomposition.progression_loop}` : "",
    plan.decomposition?.growth_path ? `成长路径：${plan.decomposition.growth_path}` : "",
    plan.decomposition?.ending_flavor ? `结局风味：${plan.decomposition.ending_flavor}` : "",
    plan.constraints.length > 0 ? `硬约束：${plan.constraints.join("；")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildDirectorCandidatePrompt(input: {
  idea: string;
  context: DirectorProjectContextInput;
  count: number;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback?: string;
}): { system: string; user: string } {
  return {
    system: [
      "你是长篇小说自动导演，要帮完全不懂写作的用户先选出一本书的方向。",
      "你现在只负责生成书级候选卡片，不要提前展开大纲、宏观草案或复杂嵌套结构。",
      "必须只输出严格 JSON，不要输出解释文本。",
      "输出格式必须完全等于：",
      "{\"candidates\":[{\"workingTitle\":\"\",\"logline\":\"\",\"positioning\":\"\",\"sellingPoint\":\"\",\"coreConflict\":\"\",\"protagonistPath\":\"\",\"endingDirection\":\"\",\"hookStrategy\":\"\",\"progressionLoop\":\"\",\"whyItFits\":\"\",\"toneKeywords\":[\"\",\"\"],\"targetChapterCount\":24}]}",
      `必须返回 ${input.count} 套候选，而且候选之间要有明显方向差异。`,
      "禁止输出 bookSpec、macroDraft、notes、commentary 等额外字段。",
      "所有字段都必须填满，不允许留空，不允许 null。",
    ].join("\n"),
    user: [
      `原始灵感：\n${input.idea.trim()}`,
      `当前项目上下文：\n${formatProjectContext(input.context) || "无额外上下文"}`,
      `上一轮候选摘要：\n${formatLatestBatchDigest(input.batches)}`,
      `本轮预设修正：\n${formatPresetHints(input.presets)}`,
      `本轮自由修正建议：\n${input.feedback?.trim() || "无"}`,
      [
        "生成要求：",
        "1. workingTitle 要像真实书名，不要占位词。",
        "2. logline 用 1-2 句说清主角、麻烦和故事驱动力。",
        "3. positioning、sellingPoint、coreConflict、protagonistPath、endingDirection、hookStrategy、progressionLoop 都要简短具体，适合直接做卡片展示。",
        "4. whyItFits 要说明这套方案为什么更贴近用户这轮的意图。",
        "5. toneKeywords 只给 2-4 个，不要空泛套话。",
        "6. targetChapterCount 优先贴近用户上下文中的预计章节数；如果没有，就给 24-40 的合理值。",
        "7. 信息不足时可以合理补全，但不能缺字段。",
      ].join("\n"),
    ].join("\n\n"),
  };
}

export function buildDirectorBlueprintPrompt(input: {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan;
  targetChapterCount: number;
}): { system: string; user: string } {
  return {
    system: [
      "你是长篇小说总规划导演，要把已经确认的书级方向展开成可执行的整本骨架。",
      "必须只输出严格 JSON，不要输出解释文本。",
      "输出格式只能是：{\"bookPlan\":{...},\"arcs\":[...]}。",
      "每个 arc 必须包含 chapters；每个 chapter 必须包含 scenes。",
      "chapter.planRole 只能是 setup、progress、pressure、turn、payoff、cooldown 之一。",
      "这是给写作小白使用的自动规划骨架，所以每章 expectation 必须直白、具体、可执行。",
    ].join("\n"),
    user: [
      `原始灵感：\n${input.idea.trim()}`,
      `当前项目上下文：\n${formatProjectContext(input.context) || "无额外上下文"}`,
      `已确认候选：\n${formatCandidateDigest(input.candidate, 0)}`,
      `故事宏观摘要：\n${formatStoryMacroSummary(input.storyMacroPlan) || "暂无额外宏观摘要"}`,
      `目标章节总数：${input.targetChapterCount}`,
      [
        "规划要求：",
        "1. arcs 的总章节数尽量贴近目标章节总数，可上下浮动 2 章。",
        "2. bookPlan 负责说明整本书的总目标、总钩子和主要风险。",
        "3. arc.summary 必须说清这一段承担的结构作用。",
        "4. chapter.expectation 要像给写作小白的写作提示，不能抽象空泛。",
        "5. scenes 要按顺序推进冲突，不要写成主题概述。",
        "6. 前段要有钩子，中段要有升级，后段要有回收。",
      ].join("\n"),
    ].join("\n\n"),
  };
}

export function buildDirectorRecoveryPrompt(input: {
  label: string;
  schemaHint: string;
  reason: string;
  systemPrompt: string;
  userPrompt: string;
  rawContent: string;
}): { system: string; user: string } {
  return {
    system: [
      "你不是在修补原来的文本，而是在按要求重新生成一份完整 JSON。",
      "必须重新输出一份严格符合 schema 的 JSON。",
      "不要解释，不要保留错误结构，不要输出 Markdown。",
      `目标类型：${input.label}`,
      `必须匹配的结构：${input.schemaHint}`,
      "所有必填字段都必须返回，不能省略。",
      "",
      input.systemPrompt,
    ].join("\n"),
    user: [
      input.userPrompt,
      `上一次结构校验失败原因：${input.reason}`,
      "下面是上一版输出，仅供你理解原意，不要复制其中的错误结构：",
      input.rawContent,
    ].join("\n\n"),
  };
}
