import type { NovelMaterialImportance, PromptCatalogItem } from "@/api/promptWorkbench";

export const LOCKED_FIELD_LABELS: Record<string, string> = {
  outputSchema: "输出格式",
  postValidate: "输出校验",
  postValidateFailureRecovery: "校验失败恢复",
  semanticRetryPolicy: "语义重试策略",
  taskType: "任务类型",
  mode: "输出模式",
  contextPolicy: "上下文策略",
  toolCatalog: "工具目录",
  approvalBoundary: "审批边界",
};

export const SLOT_KIND_LABELS: Record<string, string> = {
  replace: "改写",
  append: "追加约束",
  choice: "选项",
  toggle: "开关",
  token: "内联值",
};

export const CONTEXT_GROUP_LABELS: Record<string, string> = {
  book_contract: "全书合约",
  chapter_boundary: "章节边界",
  chapter_mission: "本章任务",
  character_dynamics: "角色关系动态",
  character_hard_facts: "角色硬事实",
  character_resource_context: "角色资源状态",
  continuation_constraints: "续写约束",
  custom_slot: "自定义约束",
  historical_issues: "历史审校问题",
  incremental_round_context: "增量生成轮次",
  local_state: "当前局面",
  narrative_progress_hint: "叙事进度提示",
  obligation_contract: "义务合约",
  open_conflicts: "开放冲突",
  opening_constraints: "开篇约束",
  participant_subset: "参与角色",
  payoff_directives: "伏笔操作指令",
  payoff_ledger: "伏笔台账",
  previous_chapter_hook: "上章钩子",
  previous_chapter_tail: "上章结尾",
  rag_context: "检索补充",
  recent_chapters: "近期章节摘要",
  repair_boundaries: "修文范围约束",
  repair_issues: "修文问题清单",
  state_goal: "状态与目标",
  story_macro: "宏观故事架构",
  structure_obligations: "结构义务",
  style_contract: "风格合约",
  timeline_context: "时间线",
  volume_window: "卷级进度",
  world_rules: "世界规则",
  world_slice: "世界片段",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  novel: "小说",
  chapter: "章节",
  plan: "计划",
  state: "状态",
  character: "角色",
  world: "世界设定",
  style: "风格",
  audit: "审校",
  task: "任务",
};

export const MESSAGE_ROLE_LABELS: Record<string, string> = {
  system: "系统",
  human: "用户",
  assistant: "模型",
  ai: "模型",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  writer: "写作",
  light_review: "轻审校",
  critical_review: "完整审校",
  repair: "修文",
  summary: "摘要",
  planning: "规划",
  translation: "翻译",
  analysis: "分析",
  classification: "分类",
};

export const OUTPUT_TYPE_LABELS: Record<string, string> = {
  structured: "结构化输出",
  text: "文本输出",
};

export const ENTRYPOINT_OPTIONS = [
  { value: "creative_hub", label: "创作中枢" },
  { value: "auto_director", label: "自动导演" },
  { value: "chapter_pipeline", label: "章节流水线" },
  { value: "manual_test", label: "手动测试" },
];

export const MANAGEMENT_STATUS_LABELS: Record<PromptCatalogItem["managementStatus"], string> = {
  complete: "元数据完整",
  missing_context_requirements: "缺上下文需求",
  missing_slots: "缺槽位声明",
};

export const MATERIAL_IMPORTANCE_LABELS: Record<NovelMaterialImportance, string> = {
  must: "必需",
  high: "重要",
  medium: "辅助",
  low: "参考",
};

export const CONTEXT_STATUS_LABELS = {
  selected: "已注入",
  dropped: "已裁剪",
  summarized: "已摘要",
  available: "候选",
} as const;

export const LOCKED_CONTEXT_GROUPS = new Set([
  "chapter_mission",
  "character_hard_facts",
  "obligation_contract",
  "style_contract",
  "local_state",
  "previous_chapter_hook",
  "volume_window",
  "participant_subset",
]);

export function statusBadgeVariant(status: PromptCatalogItem["managementStatus"]) {
  return status === "complete" ? "default" : "secondary";
}

export function capabilityLabels(prompt: PromptCatalogItem): string[] {
  return [
    prompt.capabilities.hasOutputSchema ? "Schema" : null,
    prompt.capabilities.hasPostValidate ? "PostValidate" : null,
    prompt.capabilities.hasSemanticRetryPolicy ? "SemanticRetry" : null,
    prompt.capabilities.hasRepairPolicy ? "Repair" : null,
    prompt.capabilities.hasStructuredOutputHint ? "OutputHint" : null,
  ].filter(Boolean) as string[];
}
