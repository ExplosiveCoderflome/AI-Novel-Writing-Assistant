import { CHAPTER_PROSE_QUALITY_RULES, CHAPTER_PROSE_QUALITY_AUDIT_RULES } from "@ai-novel/shared/types/chapterProseContract";
import { keepsWebSerialPromptDefaults, type CreativePromptGuidance } from "./creativePromptGuidance";

const LITERARY_PROSE_RULES = [
  "停顿、长段、复沓、心理与议论按文体和上下文功能判断，不因标点或句式本身机械删改。",
  "减少没有信息或感受变化的重复，保持人物用语、视角、意象与对白的一致性；保留有功能的留白与叙述。",
  "禁止出现 AI 自述、拒绝话术、占位符、任务单、Prompt、Schema、上下文包等工程说明。",
] as const;
const LITERARY_AUDIT_RULES = [
  "核对 AI 自述、占位符和工程说明泄漏；标点、长段、复沓与议论只在妨碍当前文体功能时指出。",
  "表达判断须引用当前正文，说明实际阅读影响；不把固定句式或标点命中本身当作修文理由。",
] as const;

export function creativeProseRules(guidance: CreativePromptGuidance | null | undefined): readonly string[] {
  return keepsWebSerialPromptDefaults(guidance) ? CHAPTER_PROSE_QUALITY_RULES : LITERARY_PROSE_RULES;
}
export function creativeProseAuditRules(guidance: CreativePromptGuidance | null | undefined): readonly string[] {
  return keepsWebSerialPromptDefaults(guidance) ? CHAPTER_PROSE_QUALITY_AUDIT_RULES : LITERARY_AUDIT_RULES;
}
