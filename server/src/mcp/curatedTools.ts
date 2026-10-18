import type { AgentToolName } from "../agents/types";

/**
 * MCP 对外暴露的工具白名单（MVP）。
 * 从内部 60 个 agent 工具里策展出 20 个，覆盖 agent 驱动整书的全链路。
 * 读多写少：写操作只保留建小说、存草稿等低风险项， destructive 的 patch/diff 类工具暂不暴露。
 */
export const MCP_CURATED_TOOLS: readonly AgentToolName[] = [
  // —— 小说生命周期 ——
  "list_novels",
  "create_novel",
  "get_novel_context",
  "get_novel_production_status",
  // —— 导演驱动 ——
  "start_full_novel_pipeline",
  "get_director_run_status",
  "run_director_next_step",
  "run_director_until_gate",
  "explain_director_next_action",
  // —— 生成 ——
  "generate_world_for_novel",
  "generate_novel_characters",
  "generate_novel_outline",
  "generate_story_bible",
  // —— 章节读写 ——
  "list_chapters",
  "get_chapter_content",
  "save_chapter_draft",
  // —— 查询诊断 ——
  "list_worlds",
  "get_world_detail",
  "list_base_characters",
  "retry_task",
  "explain_generation_blocker",
];
