function candidate(overrides = {}) {
  const scenes = [1, 2, 3].map(index => ({
    key: `scene-${index}`, title: `线索推进${index}`, purpose: '确认资源危机来源并推进调查。',
    mustAdvance: ['获得可验证证据'], mustPreserve: ['保留前文纸条来源'],
    entryState: '主角带着纸条进入调查。', exitState: '证据指向新的调查入口。',
    forbiddenExpansion: ['不得提前解决下一章事件'], targetWordCount: 1000,
  }));
  return {
    novelId: 'novel-1', volumeId: 'volume-1', chapterId: 'chapter-2', chapterOrder: 2,
    title: '第二章 资源危机', summary: '主角开始调查资源危机。', purpose: '推进主角主动试探。',
    exclusiveEvent: '首次确认危机来自内部。', endingState: '拿到第一份证据。',
    nextChapterEntryState: '带着证据继续试探。', conflictLevel: 45, revealLevel: 35,
    targetWordCount: 3000, mustAvoid: '不得提前揭示幕后人。', payoffRefs: ['资源危机'],
    taskSheet: '调查资源危机，核实证据来源，结尾保留下一步调查入口。',
    sceneCards: JSON.stringify({targetWordCount: 3000, scenes}), ...overrides,
  };
}
function generationInput(options = {}) {
  const source = candidate();
  const chapter = {...source, id: source.chapterId, taskSheet: null, sceneCards: null};
  return {
    promptInput: {novel: {title: '测试小说', characters: []}, workspace: {novelId: source.novelId, volumes: []},
      storyMacroPlan: null, strategyPlan: null, targetVolume: {id: source.volumeId, sortOrder: 1,
        title: '第一卷', chapters: [chapter], openPayoffs: []}, targetBeatSheet: null, targetChapter: chapter,
      detailMode: 'task_sheet'}, options,
  };
}
const safe = {verdict: 'usable', safeToSync: true, loadRisk: 'normal', recommendedHandling: 'use_as_is',
  summary: '前文事实一致。', issues: [], repairGuidance: [], confidence: 0.9};
module.exports = {candidate, generationInput, safe};
