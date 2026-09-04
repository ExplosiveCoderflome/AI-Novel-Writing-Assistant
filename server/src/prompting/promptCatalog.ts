const PROMPT_CATALOG_SHORT_DESCRIPTIONS: Record<string, string> = {
  "novel.chapter.writer": "章节正文生成",
  "novel.short_story.segment.write": "短篇正文生成",
  "novel.short_story.full.audit": "短篇全文审校",
  "agent.runtime.fallback_answer": "运行时兜底回复",
  "agent.runtime.setup_guidance": "创作设置引导",
  "agent.runtime.setup_ideation": "创意启发引导",
  "drama.source.original_bundle": "原创短剧素材",
  "drama.source.text_bundle": "改编短剧素材",
  "drama.track.recommendation": "短剧赛道推荐",
  "drama.source.supplement": "短剧素材补充",
  "drama.strategy": "短剧创作策略",
  "drama.episodeOutline": "短剧分集大纲",
  "drama.episode.script": "短剧单集剧本",
  "drama.episode.quality": "短剧单集审校",
  "drama.episode.compliance": "短剧合规检查",
  "drama.episode.repair": "短剧单集修复",
  "drama.storyboard": "短剧分镜生成",
  "drama.video.prompt": "短剧视频提示词",
  "comic.episodeOutline": "漫画分集大纲",
  "comic.panelScript": "漫画分镜脚本",
  "rag.contextual_chunk.prefix": "知识片段上下文",
  "audit.chapter.full": "完整章节审校",
  "audit.chapter.light": "快速章节审校",
  "novel.review.repair": "章节整章修复",
  "novel.review.patch": "章节局部补丁",
  "novel.review.chapter": "章节正文审校",
  "novel.chapter.summary": "章节摘要生成",
  "novel.chapter.acceptance_assessment": "章节验收评估",
  "novel.chapter.artifact_delta.extract": "章节事实变化提取",
  "novel.chapter_editor.rewrite_candidates": "章节候选改写",
  "novel.chapter_editor.user_intent": "改稿意图理解",
  "novel.chapter_editor.workspace_diagnosis": "章节编辑诊断",
  "novel.director.workspace_analysis": "导演工作区分析",
  "novel.director.manual_edit_impact": "手动改动影响评估",
  "novel.volume.strategy.critique": "分卷策略审校",
  "novel.volume.chapter_execution_contract": "章节执行合同",
  "novel.volume.chapter_task_sheet_quality": "章节任务表审校",
  "novel.characterDynamics.chapterExtract": "角色关系变化提取",
  "novel.character_resource.extract_updates": "角色资源变化提取",
  "novel.timeline.extractor": "时间线提取",
  "world.consistency.check": "世界观一致性检查",
  "world.import.extract": "世界设定提取",
  "planner.intent.parse": "规划意图理解",
};

export function getPromptCatalogShortDescription(promptId: string, taskType?: string): string {
  const explicit = PROMPT_CATALOG_SHORT_DESCRIPTIONS[promptId];
  if (explicit) return explicit;

  switch (taskType) {
    case "chapter_drafting":
    case "writer": return "正文生成";
    case "chapter_review":
    case "review":
    case "light_review":
    case "critical_review": return "内容审校";
    case "chapter_repair":
    case "repair": return "内容修复";
    case "outline_planning":
    case "planner": return "内容规划";
    case "replan": return "重新规划";
    case "state_resolution": return "状态判断";
    case "summary_generation":
    case "summary": return "内容摘要";
    case "fact_extraction": return "信息提取";
    case "chat": return "对话引导";
    default: return "通用任务";
  }
}

export function formatPromptLiveLabel(input: { promptId: string; promptVersion?: string | null; taskType?: string }): string {
  const version = input.promptVersion ? `@${input.promptVersion}` : "";
  return `${getPromptCatalogShortDescription(input.promptId, input.taskType)} · ${input.promptId}${version}`;
}
