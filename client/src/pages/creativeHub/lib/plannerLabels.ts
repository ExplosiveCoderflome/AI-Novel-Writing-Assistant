const INTENT_LABELS: Record<string, string> = {
  list_novels: "列出小说",
  list_worlds: "列出世界观",
  query_task_status: "查询任务状态",
  create_novel: "创建小说",
  select_novel_workspace: "切换小说工作区",
  bind_world_to_novel: "绑定世界观到小说",
  produce_novel: "整本生产",
  query_novel_production_status: "查询整本生产状态",
  query_novel_title: "查询小说标题",
  query_chapter_content: "查询章节内容",
  query_progress: "查询创作进度",
  inspect_failure_reason: "诊断失败原因",
  write_chapter: "写作章节",
  rewrite_chapter: "重写章节",
  save_chapter_draft: "保存章节草稿",
  start_pipeline: "启动流水线",
  inspect_characters: "查看角色规划",
  inspect_timeline: "查看时间线",
  inspect_world: "查看世界观",
  search_knowledge: "检索知识库",
  general_chat: "一般对话",
  unknown: "未识别意图",
};

const PLANNER_SOURCE_LABELS: Record<string, string> = {
  llm: "大模型识别",
  unknown: "未知来源",
};

function formatBilingualLabel(label: string, rawValue: string) {
  return `${label}（${rawValue}）`;
}

export function getIntentDisplayLabel(intent: unknown): string {
  const rawValue = typeof intent === "string" && intent.trim() ? intent.trim() : "unknown";
  const label = INTENT_LABELS[rawValue] ?? "未映射意图";
  return formatBilingualLabel(label, rawValue);
}

export function getPlannerSourceDisplayLabel(source: unknown): string {
  const rawValue = typeof source === "string" && source.trim() ? source.trim() : "unknown";
  const label = PLANNER_SOURCE_LABELS[rawValue] ?? "未映射来源";
  return formatBilingualLabel(label, rawValue);
}
