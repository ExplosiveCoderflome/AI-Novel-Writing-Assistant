/** Editorial cross-references. These links describe use, rather than the order of model calls. */
export interface AtlasTopic {
  id: string;
  title: string;
  description: string;
  steps: string[];
  prompts: [id: string, title: string, companionTo?: string[]][];
}
export interface AtlasScope {
  id: string;
  title: string;
  skin: string;
  topics: AtlasTopic[];
}
export interface AtlasLocation { scope: string; topic?: string }

export const atlasScopes: AtlasScope[] = [
  {
    id: "opening", title: "开书定方向", skin: "opening", topics: [
      { id: "ideas", title: "寻找故事灵感", description: "从一个想法或一组故事元素出发，找到可以拿来开书的方向。", steps: ["idea", "inspiration"],
        prompts: [
          ["novel.director.idea_inspiration", "生成开书灵感"],
          ["novel.director.idea_constellation_options", "挑选故事元素"],
          ["novel.director.idea_constellation_compose", "组合元素成故事"],
          ["novel.framing.suggest", "拟定作品定位", ["idea"]],
        ] },
      { id: "pitches", title: "比较与打磨开书方案", description: "从两条路线展开候选，给方案起名，讨论并采纳修改。", steps: ["directions", "new-directions", "candidates", "titles", "discuss", "retitle", "choose"],
        prompts: [
          ["novel.director.direction_pair", "构思两条方向"],
          ["novel.director.candidates", "展开候选方案"],
          ["novel.director.candidate_titles", "为候选取书名"],
          ["novel.director.candidate_dialogue", "讨论候选方案"],
          ["novel.director.candidate_patch", "修改候选方案", ["discuss"]],
          ["title.generation", "独立拟定书名", ["titles", "retitle"]],
        ] },
      { id: "position", title: "题材、读者与推进模式", description: "为正在构思的书挑选题材、平台和故事推进方式。", steps: [],
        prompts: [
          ["novel.create.resource_recommendation", "匹配题材与推进模式", ["idea"]],
          ["novel.writing_platform.recommend", "推荐写作平台"],
          ["genre.tree.generate", "梳理题材分类"],
          ["storyMode.tree.generate", "梳理故事模式"],
          ["storyMode.child.generate", "细分故事模式"],
          ["storyMode.expansion.recommend", "推荐模式扩展方向"],
        ] },
      { id: "market", title: "参考市场选题", description: "在市场雷达里读平台信号，提炼可供开书参考的简报。", steps: [],
        prompts: [
          ["market_radar.platform_digest", "归纳平台榜单信号"],
          ["market_radar.cross_platform_synthesis", "对照不同平台"],
          ["market_radar.creative_brief", "提炼开书简报", ["idea"]],
        ] },
    ],
  },
  {
    id: "foundation", title: "搭建全书", skin: "foundation", topics: [
      { id: "story-design", title: "确定全书主线", description: "围绕选定的故事建立主线、创作约定与可沿用的材料。", steps: ["story", "contract"],
        prompts: [
          ["novel.story_macro.decomposition", "规划全书主线"],
          ["novel.story_macro.field_regeneration", "调整主线中的一项设定", ["story"]],
          ["novel.director.book_contract", "确定全书创作约定"],
          ["novel.creative_carryover.contract", "整理承接的创作约束", ["contract"]],
          ["novel.director.blueprint", "编制导演蓝图", ["story"]],
          ["novel.bible.generate", "编写全书设定集"],
        ] },
      { id: "world-build", title: "建立世界骨架", description: "从本书主题或世界草案出发，安排规则、结构和不同层次的设定。", steps: ["world", "reuse-world"],
        prompts: [
          ["novel.world.generate_from_theme", "从本书主题生成世界"],
          ["world.draft.generate", "起草世界设定", ["world"]],
          ["world.skeleton.generate", "搭建世界骨架", ["world"]],
          ["world.structure.generate", "生成世界结构章节", ["world"]],
          ["world.structure.backfill", "补齐世界结构", ["world"]],
          ["world.layer.generate", "展开一个世界层次", ["world"]],
          ["world.layer.localize", "整理设定层的中文表述"],
        ] },
      { id: "world-ideas", title: "寻找世界设定素材", description: "在世界观工作台收集参考，选择属性、公理和适合的概念。", steps: [],
        prompts: [
          ["world.reference.inspiration", "从参考资料寻找灵感"],
          ["world.inspiration.concept_card", "提炼世界概念卡"],
          ["world.inspiration.localize_concept_card", "将概念卡译为中文"],
          ["world.import.extract", "从资料提取世界设定", ["world"]],
          ["world.property_options.generate", "构思世界属性"],
          ["world.axioms.suggest", "推荐世界公理", ["world"]],
        ] },
      { id: "world-refine", title: "深化与校对世界设定", description: "通过追问和备选草案补足已有设定，再检查内部矛盾。", steps: [],
        prompts: [
          ["world.draft.refine", "细化世界草案", ["world"]],
          ["world.draft.refine_alternatives", "比较世界草案备选", ["world"]],
          ["world.deepening.questions", "追问设定细节", ["world"]],
          ["world.deepening.integrate_answers", "整合世界补充回答", ["world"]],
          ["world.consistency.check", "检查世界设定一致性", ["world"]],
          ["world.visualization.generate", "将世界设定可视化"],
        ] },
      { id: "cast-build", title: "组建人物阵容", description: "按本书需要生成整套阵容或分步生成人物与关系。", steps: ["cast"],
        prompts: [
          ["novel.character.castAuto", "自动组建阵容"],
          ["novel.character.castAuto.members", "生成阵容成员"],
          ["novel.character.castAuto.relations", "搭建成员关系"],
          ["novel.character.castOptions", "构思备选阵容", ["cast"]],
          ["novel.production.characters", "准备创作所需人物", ["cast"]],
          ["character.base.skeleton", "搭建角色骨架", ["cast"]],
          ["character.base.final", "完善人物底稿", ["cast"]],
        ] },
      { id: "cast-edit", title: "补齐与校对人物资料", description: "讨论人物设定，补充缺失人物并核对角色资料。", steps: ["cast-discussion"],
        prompts: [
          ["novel.director.cast_dialogue", "讨论当前角色"],
          ["novel.director.character_profile_dialogue", "编辑本书角色资料", ["cast-discussion"]],
          ["novel.director.character_profile_impact", "分析角色资料改动影响"],
          ["novel.character.castAuto.repair", "修复自动阵容", ["cast"]],
          ["novel.character.castAuto.zhNormalize", "统一自动阵容的中文表述", ["cast"]],
          ["novel.character.castOptions.repair", "修复备选阵容", ["cast"]],
          ["novel.character.castOptions.zhNormalize", "统一备选阵容的中文表述", ["cast"]],
          ["novel.character.supplemental", "补充所需角色", ["cast"]],
          ["novel.character.supplemental.zhNormalize", "整理补充角色的中文资料", ["cast"]],
          ["novel.character.visible_profile.complete", "补齐角色可见档案", ["cast"]],
          ["novel.character.worldCheck", "核对人物与世界设定", ["cast"]],
        ] },
    ],
  },
  {
    id: "volumes", title: "分卷排章", skin: "volumes", topics: [
      { id: "volumes-plan", title: "安排各卷职责与节奏", description: "从分卷策略、评议和卷骨架走到当前卷的节奏与章节安排。", steps: ["strategy", "critique", "skeleton", "volume-discussion", "beats", "chapter-list", "next-volume"],
        prompts: [
          ["novel.volume.strategy", "制定分卷策略"],
          ["novel.volume.strategy.critique", "检查分卷安排"],
          ["novel.volume.skeleton", "生成各卷骨架"],
          ["novel.volume.summary_emphasis", "标出卷纲冲突与转折", ["skeleton"]],
          ["novel.director.volume_dialogue", "讨论当前卷纲"],
          ["novel.volume.beat_sheet", "安排卷内节奏"],
          ["novel.volume.chapter_list", "拆分章节列表"],
          ["novel.volume.chapter_title_repair", "调整相似章名"],
          ["novel.volume.rebalance.adjacent", "调平相邻两卷", ["critique"]],
        ] },
      { id: "outline-workspace", title: "在大纲工作台排章", description: "生成、导入或讨论一份大纲，按卷细化节奏并提出修改。", steps: [],
        prompts: [
          ["outline.initial_generate", "起草一份大纲"],
          ["outline.import_parse", "解析导入的大纲"],
          ["outline.workbench_dialogue", "围绕大纲连续讨论"],
          ["outline.volume_beats", "安排各卷节奏段", ["beats"]],
          ["outline.edit_proposal", "提出大纲修改方案"],
          ["outline.volume_review", "调整选中分卷的卷纲"],
          ["outline.chapter_review", "审阅选中章节的章纲"],
          ["outline.text_feedback", "将章节反馈带回大纲"],
          ["outline.character_impact", "评估人物调整对大纲的影响"],
        ] },
      { id: "planning", title: "故事弧与篇幅规划", description: "在规划或重新规划时安排全书、故事弧和短篇幅长书的结构。", steps: [],
        prompts: [
          ["planner.book.plan", "规划整本书", ["story"]],
          ["planner.arc.plan", "规划故事弧", ["strategy"]],
          ["planner.replan.window_decision", "判定重新规划的范围"],
          ["novel.outline.generate", "生成叙事大纲", ["story"]],
          ["novel.structuredOutline.generate", "生成结构化大纲"],
          ["novel.structuredOutline.repair", "修复结构化大纲"],
          ["novel.draft_optimize.selection", "局部改写大纲草稿"],
          ["novel.draft_optimize.full", "整体优化大纲草稿"],
          ["novel.compact_book.structure", "规划紧凑篇幅的全书结构", ["strategy"]],
        ] },
      { id: "volume-continuity", title: "卷内人物与伏笔", description: "排章时对照人物出场、关系走向以及大纲对伏笔的安排。", steps: [],
        prompts: [
          ["novel.character.initial_schedule", "安排人物初次出场", ["chapter-list"]],
          ["novel.characterDynamics.volumeProjection", "推演卷内人物关系", ["chapter-list"]],
          ["novel.payoff_ledger.outline_sync", "对照大纲同步伏笔", ["chapter-list"]],
        ] },
    ],
  },
  {
    id: "preparation", title: "准备本章", skin: "preparation", topics: [
      { id: "chapter-mission", title: "细化本章任务", description: "明确本章目标、可写边界和场景安排，检查它们能否落笔。", steps: ["mission", "check-mission", "chapter-discussion", "sync", "next-chapter"],
        prompts: [
          ["planner.chapter.plan", "规划本章", ["mission"]],
          ["novel.volume.chapter_purpose", "明确章节目的", ["mission"]],
          ["novel.volume.chapter_boundary", "划定章节边界", ["mission"]],
          ["novel.volume.chapter_task_sheet", "制作章节任务单", ["mission"]],
          ["novel.volume.chapter_execution_contract", "细化任务与场景"],
          ["novel.director.chapter_dialogue", "讨论当前章节的任务与场景"],
          ["novel.volume.chapter_task_sheet_quality", "评估任务单"],
          ["novel.beat.generate", "设计情节节拍", ["mission"]],
          ["novel.chapterHook.generate", "构思章节钩子", ["mission"]],
        ] },
      { id: "scene-material", title: "准备人物与场景材料", description: "需要补充场景材料时，可以取用局部世界设定或探索人物当前的选择。", steps: ["materials"],
        prompts: [
          ["storyWorldSlice.generate", "提取故事所需的世界片段", ["materials"]],
          ["novel.character.mind.snapshot", "形成人物心理快照", ["materials"]],
          ["novel.character.influence.options", "探索人物影响选项"],
          ["novel.character.dialogue.turn", "推演本书人物对话"],
          ["character.conversation.turn", "与角色开展对话"],
        ] },
      { id: "style-profile", title: "准备本书的写法", description: "从正文、拆书结果或创作简报提取写法，整理出生成时可用的风格约束。", steps: [],
        prompts: [
          ["style.profile.extract", "从文本提取风格档案"],
          ["style.profile.from_book_analysis", "从拆书结果提取写法"],
          ["style.profile.from_brief", "从简报定写法", ["materials"]],
          ["style.profile.metadata", "整理风格档案信息"],
          ["style.profile.select_anti_ai", "为写法选取去 AI 腔规则"],
          ["style.profile.sanitize_for_generation", "整理生成用的风格约束", ["materials"]],
          ["style.anti_ai_rule.draft", "起草去 AI 腔规则"],
          ["style.recommendation", "推荐适用写法", ["materials"]],
        ] },
    ],
  },
  {
    id: "writing", title: "写出正文", skin: "writing", topics: [
      { id: "chapter-text", title: "写正文与改稿", description: "在本章写作和章节编辑器里起草正文、诊断问题、比较改写与续写预览。", steps: ["draft"],
        prompts: [
          ["novel.chapter.writer", "生成本章正文"],
          ["novel.chapter_editor.workspace_diagnosis", "诊断当前章节"],
          ["novel.chapter_editor.user_intent", "理解改稿要求"],
          ["novel.chapter_editor.rewrite_candidates", "生成候选改写", ["repair"]],
          ["novel.chapter_editor.continue_preview", "预览接下来的正文", ["draft"]],
        ] },
      { id: "review", title: "审校与修文", description: "按当前审读场景选择快审、全文审校、局部修改或收束检查。", steps: ["review", "repair", "verify", "save", "finish","prose-discussion","final-inspection"],
        prompts: [
          ["novel.chapter.acceptance_assessment", "验收选定章节"],
          ["novel.director.final_inspection", "全书完稿检查"],
          ["novel.director.prose_dialogue", "讨论本章正文"],
          ["audit.chapter.light", "快速审校章节", ["review"]],
          ["audit.chapter.full", "完整审校章节", ["review"]],
          ["novel.review.chapter", "审阅章节正文", ["review"]],
          ["novel.review.patch", "局部修文"],
          ["novel.review.repair", "整章修文", ["repair"]],
          ["novel.continuation.rewrite_similarity", "重写续写中相似的桥段", ["repair"]],
          ["novel.compact_book.ending_audit", "检查全书结尾", ["finish"]],
        ] },
      { id: "chapter-memory", title: "把变化带入后文", description: "正文保存后，对照原文维护摘要、人物状态、时间线和伏笔。", steps: ["extract"],
        prompts: [
          ["novel.chapter.artifact_delta.extract", "提取本章故事变化"],
          ["novel.chapter.summary", "生成章节摘要", ["extract"]],
          ["novel.timeline.extractor", "提取时间线", ["extract"]],
          ["novel.characterDynamics.chapterExtract", "提取人物关系变化", ["extract"]],
          ["novel.character_resource.extract_updates", "提取角色资源变化", ["extract"]],
          ["novel.payoff_ledger.sync", "更新伏笔账本", ["extract"]],
          ["state.snapshot.extract", "提取故事状态快照", ["extract"]],
        ] },
      { id: "follow-up", title: "跟进人物与导演问题", description: "检查人物资料是否需要同步，并在改动或遇到问题时评估后续影响。", steps: [],
        prompts: [
          ["novel.character.evolve", "更新人物成长", ["extract"]],
          ["character.sync.classify", "判定角色同步方式"],
          ["novel.director.workspace_analysis", "分析导演工作区"],
          ["novel.director.manual_edit_impact", "评估手动修改影响"],
          ["director.issue.assessment", "评估导演遇到的问题"],
          ["director.state_proposal_resolution", "判断状态提案"],
        ] },
    ],
  },
  {
    id: "tools", title: "独立创作工具", skin: "opening", topics: [
      { id: "short-stories", title: "短篇创作", description: "短篇工作台可从参考素材做计划，按段写作，再通读全文并修订。", steps: [],
        prompts: [
          ["creation.short_story.reference.extract", "提炼短篇参考素材"],
          ["novel.short_story.plan", "规划短篇故事"],
          ["novel.short_story.segment.write", "生成短篇片段"],
          ["novel.short_story.full.audit", "审校短篇全文"],
          ["novel.short_story.patch.repair", "局部修订短篇"],
          ["novel.short_story.revision.impact", "评估短篇改动影响"],
        ] },
      { id: "manuscript", title: "从已有原稿开始", description: "导入原稿后提取原文事实、反推大纲、核对结局，也可诊断当前工作章。", steps: [],
        prompts: [
          ["manuscript.chapter.extract", "提取原稿章节事实"],
          ["manuscript.outline.merge", "从原稿归纳大纲"],
          ["manuscript.outline.verify", "核对原稿大纲"],
          ["manuscript.chapter.diagnose", "诊断原稿工作章"],
        ] },
      { id: "reference-books", title: "拆解参考作品", description: "对参考作品分章、做来源笔记，再生成和打磨拆书报告。", steps: [],
        prompts: [
          ["bookAnalysis.chapter.split", "划分参考书章节"],
          ["bookAnalysis.source.note", "整理来源笔记"],
          ["bookAnalysis.section.generate", "撰写拆书报告分节"],
          ["bookAnalysis.section.optimize", "优化拆书报告分节"],
        ] },
      { id: "reference-cast", title: "拆解参考书中的人物", description: "从原文识别人物、形成档案并整理跨章节的外貌证据。", steps: [],
        prompts: [
          ["bookAnalysis.character.identify", "识别原著人物"],
          ["bookAnalysis.character.profile", "整理原著人物档案"],
          ["bookAnalysis.character.generate", "生成参考人物资料"],
          ["bookAnalysis.character.appearance.snapshot", "提取人物外貌快照"],
          ["bookAnalysis.character.appearance.consolidate", "汇总外貌证据"],
          ["bookAnalysis.character.appearance.merge", "合并外貌记录"],
        ] },
      { id: "style-lab", title: "文风与写作公式", description: "在写法工具中检测文风，抽取可复用的写作公式并试写或改写。", steps: [],
        prompts: [
          ["style.detection", "检测文本风格"],
          ["style.generate", "按风格生成内容"],
          ["style.rewrite", "按风格改写"],
          ["writingFormula.extract.stream", "从文本提取写作公式"],
          ["writingFormula.apply.generate.stream", "使用写作公式试写"],
          ["writingFormula.apply.rewrite.stream", "使用写作公式改写"],
        ] },
      { id: "images", title: "封面与配图", description: "准备小说封面简报、人物配图和图像生成所需的文字描述。", steps: [],
        prompts: [
          ["image.character.prompt_optimize", "打磨人物配图描述"],
          ["image.generation_prompt.assist", "辅助撰写生图提示词"],
          ["image.novel_cover.brief", "整理小说封面简报"],
          ["image.novel_cover.prompt_optimize", "打磨封面生图提示词"],
        ] },
      { id: "comic", title: "漫画改编", description: "从原文中提取改编依据，再准备漫画分集和分镜。", steps: [],
        prompts: [
          ["comic.factExtraction", "提取漫画改编事实"],
          ["comic.episodeOutline", "规划漫画分集"],
          ["comic.panelScript", "编写漫画分镜脚本"],
        ] },
      { id: "drama-source", title: "短剧素材与策划", description: "准备原创或改编素材，选择短剧赛道与创作策略，再安排分集。", steps: [],
        prompts: [
          ["drama.source.original_bundle", "准备原创短剧素材"],
          ["drama.source.text_bundle", "整理改编原文素材"],
          ["drama.source.supplement", "补充短剧素材"],
          ["drama.track.recommendation", "推荐短剧赛道"],
          ["drama.strategy", "制定短剧创作策略"],
          ["drama.episodeOutline", "安排短剧分集"],
        ] },
      { id: "drama-script", title: "短剧剧本与分镜", description: "写出单集剧本后，可检查质量与合规，再修稿和编排镜头。", steps: [],
        prompts: [
          ["drama.episode.script", "编写单集剧本"],
          ["drama.episode.quality", "审校单集质量"],
          ["drama.episode.compliance", "核对单集合规"],
          ["drama.episode.repair", "修订单集剧本"],
          ["drama.storyboard", "设计短剧分镜"],
          ["drama.video.prompt", "编写视频生成提示词"],
        ] },
      { id: "guidance", title: "创作助手与资料检索", description: "创作助手按请求提供引导与结果答复，知识库可为检索片段补充上下文。", steps: [],
        prompts: [
          ["creation.intent.interpret", "理解创作请求"],
          ["planner.intent.parse", "理解助手规划意图"],
          ["agent.runtime.setup_guidance", "引导创作设置"],
          ["agent.runtime.setup_ideation", "启发故事构思"],
          ["agent.runtime.fallback_answer", "整理助手答复"],
          ["rag.contextual_chunk.prefix", "补充知识片段的上下文"],
        ] },
    ],
  },
];

export function relatedAtlasLocation(stageId: string, stepId: string): AtlasLocation {
  for (const scope of atlasScopes) {
    const topic = scope.topics.find(item => item.steps.includes(stepId));
    if (topic) return { scope: scope.id, topic: topic.id };
  }
  return { scope: stageId };
}
