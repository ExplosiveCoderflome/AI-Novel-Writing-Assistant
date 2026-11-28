export type StepKind = "author" | "ai" | "system" | "destination";
export interface Step {
  id: string;
  title: string;
  kind: StepKind;
  artifact: string;
  input: string;
  output: string;
  templates?: readonly (readonly [key: string, title: string, assetId?: string])[];
  destination?: string;
}
export interface Branch {
  from: string;
  steps: Step[];
  join?: string;
  label: string;
}
export interface FlowStage {
  id: string;
  coverStep: string;
  title: string;
  description: string;
  main: Step[];
  branches?: Branch[];
}
function ai(id: string, title: string, artifact: string, input: string, output: string, key: string, assetId = key): Step {
  return { id, title, artifact, input, output, kind: "ai", templates: [[key, title, assetId]] };
}
function link(id: string, title: string, artifact: string, destination: string, input: string, output: string): Step {
  return { id, title, artifact, kind: "destination", destination, input, output };
}

export const stages: FlowStage[] = [
  {
    id: "opening", coverStep: "directions", title: "开书定方向", description: "从一句想写的故事出发，挑出值得写成一本书的方向。",
    main: [
      { id: "idea", title: "输入故事想法", artifact: "一句开书灵感", kind: "author", input: "想写的题材、人物，或一个挥之不去的场景。", output: "作为两套候选方向共同起点的开书想法。" },
      ai("directions", "构思两条方向", "两条可比较的路线", "故事想法与作者希望保留的设定。", "两种会改变整本书走向的选择，各有自己的推进方式。", "novel.director.direction_pair"),
      ai("candidates", "展开候选方案", "两套完整方案", "两条选定的故事路线。", "每套方案的主角、核心冲突、开篇和后续推进方式。", "novel.director.candidates"),
      ai("titles", "为候选拟书名", "备选书名与推荐理由", "本套方案的故事细节，以及同轮另一套的方向。", "一组备选书名、取名理由和推荐书名。重做书名也使用这份提示词。", "novel.director.candidate_titles"),
      { id: "choose", title: "选定开书方案", artifact: "选定的开书方案", kind: "author", input: "本轮候选及已采纳的修改。", output: "作者选定的一套故事方案，作为新书的起点。" },
    ],
    branches: [
      { from: "idea", label: "还没想好写什么", join: "directions", steps: [
        { id: "inspiration", title: "寻找故事灵感", artifact: "可带回的故事种子", kind: "ai", input: "题材偏好或选中的故事元素。", output: "可带回开书输入的一句话灵感。",
          templates: [["novel.director.idea_inspiration", "直接生成灵感"], ["novel.director.idea_constellation_options", "寻找故事元素"], ["novel.director.idea_constellation_compose", "组合选中元素"]] },
      ] },
      { from: "candidates", label: "两套都不合适", join: "candidates", steps: [
        ai("new-directions", "重新构思方向", "新一轮故事路线", "上一轮方案与本轮希望改变的内容。", "新一轮的两条方向，供再次展开候选方案。", "next-direction-pair", "novel.director.direction_pair"),
      ] },
      { from: "titles", label: "想打磨其中一套", join: "choose", steps: [
        ai("discuss", "讨论候选方案", "可采纳的修改建议", "当前方案、讨论历史和作者的问题。", "对方案的解释或可逐项采纳的修改建议。", "novel.director.candidate_dialogue"),
      ] },
      { from: "titles", label: "只调整书名", join: "choose", steps: [
        ai("retitle", "重做候选书名", "重新拟定的书名", "当前候选、已有书名和作者对书名的意见。", "供重新选择的一组候选书名。", "novel.director.candidate_titles"),
      ] },
    ],
  },
  {
    id: "foundation", coverStep: "cast", title: "搭建全书", description: "确定故事靠什么向前走，以及人物能在怎样的世界里行动。",
    main: [
      ai("story", "规划全书主线", "矛盾、转折与回报", "选定的故事方向与开书设定。", "能支撑长篇的核心矛盾、推进方式与关键回报。", "novel.story_macro.decomposition"),
      ai("contract", "确定全书创作约定", "全书创作约定", "开书方向、故事主线和目标篇幅。", "全书的读者期待、角色成长方向和创作边界。", "novel.director.book_contract"),
      ai("world", "准备世界设定", "规则、势力与地点", "题材、故事主线和全书创作约定。", "生成本书需要的规则、势力与地点。", "novel.world.generate_from_theme"),
      { id: "cast", title: "准备人物阵容", artifact: "人物阵容与关系", kind: "ai", input: "故事需要的角色职责与可用的世界设定。",
        output: "主要人物、关系和约束后文的角色事实。已有阵容时可沿用。",
        templates: [["novel.character.castAuto", "生成完整阵容"], ["novel.character.castAuto.members", "分步生成成员"], ["novel.character.castAuto.relations", "分步生成关系"]] },
    ],
    branches: [{ from: "contract", label: "沿用或跳过", join: "cast", steps: [
      { id: "reuse-world", title: "沿用或跳过世界", artifact: "选定的世界范围", kind: "system", input: "开书时选定的世界准备方式。", output: "使用已有世界资料，或按设定跳过世界生成。" },
    ] }, { from: "cast", label: "逐人讨论", steps: [
      ai("cast-discussion", "讨论一位角色", "可逐项采纳的人物修改", "选定的开书方向、当前角色与作者的问题。", "核对性格、行动目标或故事作用后继续分卷。", "novel.director.cast_dialogue"),
    ] }],
  },
  {
    id: "volumes", coverStep: "skeleton", title: "分卷排章", description: "先安排每一卷要交付的故事，再把当前卷拆成连续的章节。",
    main: [
      ai("strategy", "制定分卷策略", "各卷职责与顺序", "全书主线、目标篇幅和角色阵容。", "全书的分卷数量、推进顺序和各卷职责。", "novel.volume.strategy"),
      ai("critique", "检查分卷安排", "分卷评议意见", "分卷策略草稿。", "对重复、断层与回报节奏的评议。", "novel.volume.strategy.critique"),
      ai("skeleton", "生成各卷骨架", "各卷的故事骨架", "分卷策略及评议结果。", "每卷的开场、压力、高潮和下一卷的承接。", "novel.volume.skeleton"),
      ai("beats", "安排卷内节奏", "本卷的关键节奏段", "当前卷的目标、骨架和章节预算。", "按顺序展开的关键事件及其章节跨度。", "novel.volume.beat_sheet"),
      { id: "chapter-list", title: "拆成章节列表", artifact: "章名、行动与出场安排", kind: "ai", input: "当前节奏段的目标、人物和前后承接。", output: "各章的标题、主要行动与出场安排。同卷章名过于相似时，可重新拟名。",
        templates: [["novel.volume.chapter_list", "拆分章节列表"], ["novel.volume.chapter_title_repair", "调整相似章名"]] },
    ],
    branches: [{ from: "skeleton", label: "调整一卷", join: "beats", steps: [
      ai("volume-discussion", "讨论一卷的卷纲", "可逐项采纳的卷纲修改", "当前卷的编辑稿、前后卷安排和作者的问题。", "核对本卷故事、读者期待、高潮或下卷引线后继续拆章。", "novel.director.volume_dialogue"),
    ] }],
  },
  {
    id: "preparation", coverStep: "mission", title: "准备本章", description: "把章节安排细化成能落笔的场景，再备齐写作要用的材料。",
    main: [
      ai("mission", "细化本章任务与场景", "任务单与场景卡", "章节列表、当前节奏段与相邻章节。", "本章目标、情节边界、写作任务单和场景安排。", "novel.volume.chapter_execution_contract"),
      ai("check-mission", "检查任务单质量", "可执行性评估", "本章任务、场景安排和前章结果。", "任务是否可执行，以及需要调整的地方。", "novel.volume.chapter_task_sheet_quality"),
      { id: "sync", title: "同步章节要求", artifact: "绑定到章节的写作要求", kind: "system", input: "已准备的章节任务与场景。", output: "将写作要求关联到对应章节，保留已有正文。" },
      { id: "materials", title: "汇集写作材料", artifact: "本章写作材料", kind: "system", input: "本章任务、人物事实、世界规则、前文进展与写法偏好。", output: "写作提示词本次可引用的材料，由正文生成步骤使用。" },
    ],
    branches: [{ from: "check-mission", label: "调整一章", join: "sync", steps: [
      ai("chapter-discussion", "讨论一章的任务与场景", "可逐项采纳的章节修改", "所选章的任务、场景和当前编辑稿。", "确认后把本批章节要求交给正文生成。", "novel.director.chapter_dialogue"),
    ] }],
  },
  {
    id: "writing", coverStep: "finish", title: "写出正文", description: "写完一章，审读、选稿，把发生的变化带进下一章。",
    main: [
      ai("draft", "生成本章初稿", "整章正文草稿", "章节任务、前文进展、人物事实与写法要求。", "一份完整的章节正文草稿。", "novel.chapter.writer"),
      ai("review", "审校本章", "带原文依据的审校意见", "本章草稿、写作任务与前文事实。", "本章完成情况，以及有正文证据的质量问题。", "novel.chapter.acceptance_assessment"),
      { id: "save", title: "选定并保存正文", artifact: "本章选定稿", kind: "system", input: "初稿及通过复核的可用修订稿。", output: "本章选定的正文版本，供提取故事变化。" },
      ai("extract", "提取故事变化", "人物、事实与伏笔更新", "选定的正文及已有的故事记录。", "更新章节摘要、角色状态、事实与伏笔，供后文承接。", "novel.chapter.artifact_delta.extract"),
      { id: "finish", title: "整本正文生成完成", artifact: "整本小说正文", kind: "system", input: "全书范围内各章的正文与处理结果。", output: "各章正文均已保存，整本小说可以连续阅读。" },
    ],
    branches: [
      { from: "review", label: "需要修文", join: "save", steps: [
        ai("repair", "局部修文", "局部修订稿", "原稿与明确的修复要求。", "只修改相关段落的候选稿。", "novel.review.patch"),
        ai("verify", "复核修订稿", "修订稿复核意见", "修订稿、原审校问题与事实基线。", "对修订效果和事实保留情况的复核。", "verify-repair", "novel.chapter.acceptance_assessment"),
      ] },
      { from:"finish",label:"检查后导出",steps:[
        ai("final-inspection","全书完稿检查","可定位原文的问题","逐章正文、全书约定、邻章衔接与审校线索。","核对问题并逐段修订，确认后导出全书。","novel.director.final_inspection"),
      ]},
      { from:"extract",label:"核对本批正文",join:"finish",steps:[
        ai("prose-discussion","讨论本章正文","逐段修改建议","所选章节正文、写作要求和当前编辑稿。","逐项采纳并确认后，按所选范围继续写作。","novel.director.prose_dialogue"),
      ]},
      { from: "extract", label: "本卷未完", steps: [
        link("next-chapter", "准备下一章", "下一章的写作任务", "mission", "本章保存后的进展。", "回到本章准备，细化下一章的任务与场景。"),
      ] },
      { from: "extract", label: "进入下一卷", steps: [
        link("next-volume", "安排下一卷", "下一卷的节奏安排", "beats", "前卷结果与下一卷骨架。", "接回卷内节奏，继续安排下一卷的章节。"),
      ] },
    ],
  },
];

export function stageSteps(stage: FlowStage) {
  return [...stage.main, ...(stage.branches ?? []).flatMap(branch => branch.steps)];
}

export function locateFlowStep(id: string | null) {
  if (!id) return;
  for (const [index, stage] of stages.entries()) {
    const mainIndex = stage.main.findIndex(step => step.id === id);
    if (mainIndex >= 0) return {
      stage, step: stage.main[mainIndex], optional: false,
      next: stage.main[mainIndex + 1] ?? stages[index + 1]?.main[0],
    };
    for (const branch of stage.branches ?? []) {
      const branchIndex = branch.steps.findIndex(step => step.id === id);
      if (branchIndex >= 0) return {
        stage, step: branch.steps[branchIndex], optional: true,
        next: branch.steps[branchIndex + 1] ?? stage.main.find(step => step.id === branch.join),
      };
    }
  }
}
