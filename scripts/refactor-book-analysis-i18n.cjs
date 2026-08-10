const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_SRC = path.join(ROOT_DIR, 'client', 'src');
const ZH_LOCALE_PATH = path.join(CLIENT_SRC, 'locales', 'zh', 'translation.json');
const EN_LOCALE_PATH = path.join(CLIENT_SRC, 'locales', 'en', 'translation.json');

const zhLocale = JSON.parse(fs.readFileSync(ZH_LOCALE_PATH, 'utf8'));
const enLocale = JSON.parse(fs.readFileSync(EN_LOCALE_PATH, 'utf8'));

function setNestedValue(obj, keyPathStr, value) {
  const keys = keyPathStr.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!current[k] || typeof current[k] !== 'object') {
      current[k] = {};
    }
    current = current[k];
  }
  current[keys[keys.length - 1]] = value;
}

// 设定核心 bookAnalysis 语义 Key
const BOOK_ANALYSIS_KEYS = {
  'bookAnalysis.headerContextDiagnosis': { zh: '稿件诊断 · 原文与结果工作台', en: 'Manuscript Diagnosis · Source & Workbench' },
  'bookAnalysis.headerContextReference': { zh: '参考拆书 · 原文与结果工作台', en: 'Reference Analysis · Source & Workbench' },
  'bookAnalysis.headerTitleDefault': { zh: '拆书分析', en: 'Book Analysis' },
  'bookAnalysis.headerDescWithAnalysis': { zh: '围绕来源文档阅读结构、人物、世界和写法结论；结果可以继续发布到小说知识库或交给创作中枢引用。', en: 'Read structure, character, worldbuilding, and writing technique conclusions from source document.' },
  'bookAnalysis.headerDescDefault': { zh: '选择来源文档并生成结构化拆书结果，完成后可直接阅读小节、回看原文证据和整理角色档案。', en: 'Select a source document to generate structured book analysis results. Read sections, review evidence, and organize character profiles.' },
  'bookAnalysis.metaSource': { zh: '来源：{{title}} · v{{version}}', en: 'Source: {{title}} · v{{version}}' },
  'bookAnalysis.metaStage': { zh: '阶段：{{stage}}', en: 'Stage: {{stage}}' },
  'bookAnalysis.metaStageReadable': { zh: '结果可阅读', en: 'Results Readable' },
  'bookAnalysis.metaProgress': { zh: '进度：{{progress}}%', en: 'Progress: {{progress}}%' },
  'bookAnalysis.metaScope': { zh: '范围：{{scope}}', en: 'Scope: {{scope}}' },
  'bookAnalysis.metaScopeFull': { zh: '全文', en: 'Full Text' },
  'bookAnalysis.metaPlannedSections': { zh: '计划小节：{{readable}}/{{expected}} 可阅读', en: 'Planned Sections: {{readable}}/{{expected}} Readable' },

  // Workspace NextAction
  'bookAnalysis.nextAction.selectTitle': { zh: '选择一份拆书分析', en: 'Select a Book Analysis' },
  'bookAnalysis.nextAction.selectDesc': { zh: '从分析列表选择记录后，这里会显示来源、生成阶段和可阅读结果。', en: 'Select an analysis from the list to view source, stage, and readable results.' },
  'bookAnalysis.nextAction.createTitle': { zh: '创建第一份拆书分析', en: 'Create First Book Analysis' },
  'bookAnalysis.nextAction.createDesc': { zh: '选择一份知识文档和分析范围，AI 会把结果整理为可阅读、可引用的小节。', en: 'Select a knowledge document and scope. AI will organize results into readable, quotable sections.' },
  'bookAnalysis.nextAction.newAnalysis': { zh: '新建拆书', en: 'New Book Analysis' },
  'bookAnalysis.nextAction.queuedTitle': { zh: '拆书分析正在排队', en: 'Book Analysis Queued' },
  'bookAnalysis.nextAction.generatingTitle': { zh: '拆书分析正在生成', en: 'Generating Book Analysis' },
  'bookAnalysis.nextAction.progressWithResults': { zh: '当前进度 {{progress}}%，已有 {{readable}} 个小节可阅读；其余计划小节继续生成。', en: 'Progress: {{progress}}%. {{readable}} sections readable; remaining sections generating.' },
  'bookAnalysis.nextAction.progressGenerating': { zh: '当前进度 {{progress}}%。已完成的小节会直接保留，全部完成后可在“拆书内容”中阅读。', en: 'Progress: {{progress}}%. Completed sections preserved for reading.' },
  'bookAnalysis.nextAction.viewExistingResults': { zh: '查看已有结果', en: 'View Existing Results' },
  'bookAnalysis.nextAction.budgetTitle': { zh: '扩容预算后继续生成', en: 'Expand Budget & Resume' },
  'bookAnalysis.nextAction.budgetDesc': { zh: '已有 {{readable}} 个可阅读小节会保留。{{missing}}扩容续跑只处理尚未成功的部分。', en: '{{readable}} readable sections preserved. {{missing}}Resuming processes incomplete sections.' },
  'bookAnalysis.nextAction.budgetLabel': { zh: '扩容预算并续跑', en: 'Expand Budget & Resume' },
  'bookAnalysis.nextAction.missingExpected': { zh: '仍有 {{count}} 个计划小节缺少可读结果。', en: '{{count}} expected sections missing readable content. ' },
  'bookAnalysis.nextAction.noMissingInScope': { zh: '计划范围内没有缺失小节。', en: 'No sections missing in scope. ' },
  'bookAnalysis.nextAction.noResultsTitle': { zh: '任务完成，但没有可展示的拆书内容', en: 'Task completed, but no displayable analysis content' },
  'bookAnalysis.nextAction.noResultsDesc': { zh: '源文档不会受影响。请重新生成分析，或打开任务中心查看这次任务的详细记录。', en: 'Source document unaffected. Please regenerate analysis or check Task Center.' },
  'bookAnalysis.nextAction.regenerateAnalysis': { zh: '重新生成分析', en: 'Regenerate Analysis' },
  'bookAnalysis.nextAction.reviewTitle': { zh: '结果可阅读，部分小节需要复核', en: 'Results readable; some sections need review' },
  'bookAnalysis.nextAction.reviewDesc': { zh: '{{readable}}/{{expected}} 个计划小节均有可读内容，其中 {{failed}} 个小节最近一次生成失败。先检查保留内容，再决定是否重新生成。', en: '{{readable}}/{{expected}} sections readable; {{failed}} sections failed generation.' },
  'bookAnalysis.nextAction.resultsReadyTitle': { zh: '拆书结果可以阅读', en: 'Book Analysis Results Ready' },
  'bookAnalysis.nextAction.resultsReadyDesc': { zh: '共 {{readable}} 个小节已生成，可继续查看证据、整理角色，或发布到小说知识库。', en: '{{readable}} sections generated. Review evidence, organize characters, or publish.' },
  'bookAnalysis.nextAction.viewResults': { zh: '查看拆书结果', en: 'View Results' },
  'bookAnalysis.nextAction.stoppedTitle': { zh: '分析已停止，已有结果仍可阅读', en: 'Analysis Stopped; Existing Results Readable' },
  'bookAnalysis.nextAction.stoppedDesc': { zh: '已保留 {{readable}} 个可阅读小节。{{missing}}先检查已有结果，再决定是否重新生成。', en: '{{readable}} readable sections preserved. {{missing}}Check results before regenerating.' },
  'bookAnalysis.nextAction.needRebuildTitle': { zh: '拆书分析需要重新生成', en: 'Book Analysis Needs Regeneration' },
  'bookAnalysis.nextAction.needRebuildDescDefault': { zh: '本次分析没有生成可阅读结果，源文档不会受影响。', en: 'No readable results generated. Source document unaffected.' },
  'bookAnalysis.nextAction.archivedTitleReadable': { zh: '查看归档结果', en: 'View Archived Results' },
  'bookAnalysis.nextAction.archivedTitleCopy': { zh: '复制归档分析后继续', en: 'Copy Archived Analysis & Continue' },
  'bookAnalysis.nextAction.archivedDescReadable': { zh: '归档分析保持只读，已有结果、证据和角色档案仍可查看。', en: 'Archived analysis remains read-only. Results, evidence, and profiles viewable.' },
  'bookAnalysis.nextAction.archivedDescCopy': { zh: '这份归档分析没有可阅读结果，可复制为新分析后重新生成。', en: 'No readable results in archived analysis. Copy as new analysis to regenerate.' },
  'bookAnalysis.nextAction.archivedLabelCopy': { zh: '复制为新分析', en: 'Copy as New Analysis' },
  'bookAnalysis.nextAction.startGenerationTitle': { zh: '开始生成拆书结果', en: 'Start Generating Book Analysis Results' },
  'bookAnalysis.nextAction.startGenerationDesc': { zh: 'AI 会按选定范围逐项生成结构、人物、世界和写法结论，并保留每个已完成小节。', en: 'AI will generate structure, characters, worldbuilding, and writing techniques step by step.' },
  'bookAnalysis.nextAction.startGenerationLabel': { zh: '开始生成', en: 'Start Generation' }
};

for (const [keyPath, { zh, en }] of Object.entries(BOOK_ANALYSIS_KEYS)) {
  setNestedValue(zhLocale, keyPath, zh);
  setNestedValue(enLocale, keyPath, en);
}

fs.writeFileSync(ZH_LOCALE_PATH, JSON.stringify(zhLocale, null, 2), 'utf8');
fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(enLocale, null, 2), 'utf8');

console.log('Book Analysis 语义化 Key 已更新至 zh 与 en 语言包！');
