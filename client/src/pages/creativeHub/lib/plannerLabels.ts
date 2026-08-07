const INTENT_LABELS: Record<string, string> = { social_opening: "Light opening", list_novels: "List novels", list_worlds: "List worldviews", query_task_status: "Query task status", create_novel: "Create novel", select_novel_workspace: "Switch novel workspace", bind_world_to_novel: "Bind worldview to novel", unbind_world_from_novel: "Unbind novel worldview", produce_novel: "Full production", query_novel_production_status: "Query full production status", query_novel_title: "Query novel title", query_chapter_content: "Query chapter content", query_progress: "Query creation progress", inspect_failure_reason: "Diagnose failure reason", write_chapter: "Write chapter", rewrite_chapter: "Rewrite chapter", save_chapter_draft: "Save chapter draft", start_pipeline: "Start pipeline", inspect_characters: "View character planning", inspect_timeline: "View timeline", inspect_world: "View worldview", search_knowledge: "Search knowledge base", ideate_novel_setup: "Generate setting alternatives", general_chat: "General dialogue", unknown: "Unrecognized intent", }; const PLANNER_SOURCE_LABELS: Record<string, string> = {
  llm: "Large model recognition",
  unknown: "unknown source",
};

function formatBilingualLabel(label: string, rawValue: string) {
  return `${label}（${rawValue}）`;
}

export function getIntentDisplayLabel(intent: unknown): string {
  const rawValue = typeof intent === "string" && intent.trim() ? intent.trim() : "unknown";
  const label = INTENT_LABELS[rawValue] ?? "Unmapped intent";
  return formatBilingualLabel(label, rawValue);
}

export function getPlannerSourceDisplayLabel(source: unknown): string {
  const rawValue = typeof source === "string" && source.trim() ? source.trim() : "unknown";
  const label = PLANNER_SOURCE_LABELS[rawValue] ?? "Unmapped source";
  return formatBilingualLabel(label, rawValue);
}
