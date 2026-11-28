/** Symbolic material for reading official prompts. Counts exercise a concrete production shape. */
const opening = {
  idea: "〈故事灵感〉", count: 2, context: { description: "〈开书设定〉", targetAudience: "〈目标读者〉" },
  batches: [], presets: [], feedback: "",
};
const candidate = {
  workingTitle: "〈候选书名〉", logline: "〈一句话梗概〉", positioning: "〈作品定位〉",
  sellingPoint: "〈卖点〉", coreConflict: "〈核心冲突〉", protagonistPath: "〈主角成长〉",
  hookStrategy: "〈开篇悬念〉", progressionLoop: "〈故事推进方式〉", endingDirection: "〈结局方向〉",
};
const chapter = { novelTitle: "〈书名〉", chapterOrder: 2, chapterTitle: "〈章名〉", targetWordCount: 3000 };
const review = {
  ...chapter, content: "〈本章正文〉", previousChapterContent: "〈上一章正文〉",
  styleReviewEnabled: true, expectedNarrativePov: "third_person",
};

export const creationTemplateInputs = {
  "novel.director.idea_inspiration": { contextSummary: "〈开书设定〉" },
  "novel.director.idea_constellation_options": { contextSummary: "〈开书设定〉" },
  "novel.director.idea_constellation_compose": { contextSummary: "〈开书设定〉", selectedSummary: "〈选中的故事元素〉" },
  "novel.director.direction_pair": opening,
  "next-direction-pair": { ...opening, feedback: "〈换一批的要求〉",
    batches: [{ roundLabel: "〈上一轮〉", refinementSummary: "〈上一轮修改摘要〉", candidates: [candidate] }] },
  "novel.director.candidates": { ...opening, directions: {
    A: { choice: "〈第一条方向〉", engine: "〈方向一的推进方式〉" },
    B: { choice: "〈第二条方向〉", engine: "〈方向二的推进方式〉" },
  } },
  "novel.director.candidate_titles": { context: { brief: "〈候选方案和同轮另一案的方向〉", genreName: "〈题材〉", count: 4 } },
  "novel.director.cast_dialogue": { storyInput: opening.idea, character: { name: "〈角色姓名〉", role: "〈身份〉", personality: "〈性格〉", currentGoal: "〈眼下想做的事〉", storyFunction: "〈在故事中的作用〉", background: null }, cast: [], relations: [], requestText: "怎样让这个角色更主动？", history: [], priorProposal: null },
  "novel.director.final_inspection": {book:{title:"〈书名〉",premise:opening.idea,promise:"〈读者期待〉",target:12,opening:"〈开篇〉",ending:"〈全书结尾〉",milestones:[]},chapter:{order:2,title:"〈章名〉",taskSheet:null,mustAvoid:null,paragraphs:{"1":"〈本章正文〉"}},previousEnding:"〈前章结尾〉",nextOpening:"〈下章开头〉",earlierConcerns:[]},
  "novel.director.prose_dialogue": {storyInput:opening.idea,chapter:{order:1,title:"〈章名〉",taskSheet:"〈章节任务〉",mustAvoid:null},editor:{"1":"〈当前段落〉"},requestText:"结尾怎样写更有余味？",history:[],priorProposal:null},
  "novel.director.chapter_dialogue": { storyInput: opening.idea, volumeTitle: "〈卷名〉", chapter: {order:1,title:"〈章名〉",summary:"〈本章概要〉"}, scenes:[], editor:{taskSheet:"〈章节任务〉"}, requestText:"主角在这一章有什么选择？", history:[], priorProposal:null },
  "novel.director.volume_dialogue": { storyInput: opening.idea, volume: { title: "〈卷名〉", sortOrder: 1, summary: "〈本卷故事〉", mainPromise: "〈读者期待〉", climax: "〈本卷高潮〉", nextVolumeHook: "〈下卷引线〉" }, previousVolume: null, nextVolume: null, requestText: "这卷的高潮能兑现前面的期待吗？", history: [], priorProposal: null },
  "novel.director.candidate_dialogue": { idea: opening.idea, candidate, requestText: "〈作者的问题〉", history: [], priorProposal: null },
  "novel.story_macro.decomposition": { storyInput: "〈选定的故事方向〉", projectContext: "〈开书设定〉" },
  "novel.director.book_contract": { targetChapterCount: 90 },
  "novel.world.generate_from_theme": {
    ...opening.context, novelTitle: "〈书名〉", commercialTags: ["〈作品标签〉"], genreName: "〈题材〉",
    bookSellingPoint: "〈核心卖点〉", first30ChapterPromise: "〈开篇承诺〉", primaryStoryModeName: "〈主故事模式〉",
    secondaryStoryModeName: "〈副故事模式〉", storyMacroContext: "〈故事规划〉", bookContractContext: "〈全书创作约定〉",
  },
  "novel.character.castAuto": {},
  "novel.character.castAuto.members": {},
  "novel.character.castAuto.relations": { storyInput: opening.idea, optionTitle: "〈阵容名称〉", optionSummary: "〈阵容摘要〉",
    protagonistNames: ["〈主角〉"], memberNames: ["〈角色姓名〉"], memberRosterText: "〈角色名单〉" },
  "novel.volume.strategy": {},
  "novel.volume.strategy.critique": {},
  "novel.volume.skeleton": {},
  "novel.volume.beat_sheet": { targetChapterCount: 30 },
  "novel.volume.chapter_list": { novel: { characters: [{ id: "〈角色编号〉", name: "〈角色姓名〉", role: "〈角色身份〉" }] } },
  "novel.volume.chapter_title_repair": { issue: "〈章名重复句式〉", chapters: [{ chapterOrder: 1, title: "〈待改章名〉", summary: "〈本章已定情节〉" }], reservedTitles: ["〈其他章名〉"] },
  "novel.volume.chapter_execution_contract": { detailMode: "task_sheet" },
  "novel.volume.chapter_task_sheet_quality": { mode: "full_book_autopilot", candidate: {
    title: chapter.chapterTitle, purpose: "〈本章目标〉", taskSheet: "〈任务单〉", sceneCards: "〈场景安排〉" } },
  "novel.chapter.writer": { ...chapter, mode: "draft", minWordCount: 2600, maxWordCount: 3400 },
  "novel.chapter.acceptance_assessment": review,
  "novel.review.patch": { ...chapter, chapterContent: review.content, issuesJson: "〈本章待修问题〉", styleProtection: "〈写法保护要求〉" },
  "verify-repair": { ...review, content: "〈修订稿〉",
    styleRewriteBaseline: { sourceContentHash: "〈原稿标识〉", changes: [{ original: "〈原句〉", replacement: "〈修订句〉" }], allowedCorrectionIssueIds: ["〈问题编号〉"] },
    repairReviewBaseline: {
    blockingIssues: [{ code: "〈问题编号〉", category: "continuity", fixSuggestion: "〈修复要求〉" }],
    missingObligations: [], repairDirectives: ["〈修订要求〉"],
  } },
  "novel.chapter.artifact_delta.extract": { ...chapter, chapterContent: "〈保存的正文〉", chapterGoal: "〈本章目标〉",
    characterRosterText: "〈角色名单〉", resourceCatalogText: "〈资源目录〉", payoffCatalogText: "〈伏笔目录〉",
    characterStateText: "〈角色状态〉", previousStateText: "〈章前状态〉", existingResourceText: "〈已有资源〉",
    existingPayoffText: "〈伏笔账本〉", characterLocationText: "〈章前角色位置〉", activeCharacterDialogueInfluenceText: "〈人物对话影响〉",
    locationTrackingEnabled: true, characterCandidateResolutionEnabled: true },
};
