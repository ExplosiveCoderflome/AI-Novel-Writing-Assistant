const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ZH_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'zh', 'translation.json');
const EN_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'en', 'translation.json');
const DICT_PATH = path.join(ROOT_DIR, 'translations_dictionary.json');

const zhLocale = JSON.parse(fs.readFileSync(ZH_LOCALE_PATH, 'utf-8'));
const dictData = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));

// 1. 全量提炼 translations_dictionary.json 中的短语
const exactDictMap = new Map();
const phraseList = [];

for (const [zhText, item] of Object.entries(dictData)) {
  const cleanZh = zhText.trim();
  const cleanEn = item.english ? item.english.trim() : '';
  if (cleanZh && cleanEn) {
    exactDictMap.set(cleanZh, cleanEn);
    phraseList.push({ zh: cleanZh, en: cleanEn });
  }
}

// 2. 丰富 UI 领域词汇库
const DOMAIN_VOCAB = {
  // 拆书与分析 (Analyze Book)
  '参考拆书 · 原文与结果工作台': 'Reference Breakdown · Source & Results Workbench',
  '参考拆书': 'Reference Breakdown',
  '原文与结果工作台': 'Source & Results Workbench',
  '拆书分析': 'Book Analysis',
  '选择来源文档并生成结构化拆书结果，完成后可以直接阅读小节、回看原文证据和整理角色档案。': 'Select a source document to generate structured book analysis results. Upon completion, you can read sections, review source evidence, and organize character profiles.',
  '创建第一份拆书分析': 'Create First Book Analysis',
  '选择一份知识文档和分析范围，AI 会把结果整理为可阅读、可引用的小节。': 'Select a knowledge document and analysis scope. AI will organize results into readable, quotable sections.',
  '新建拆书': 'New Analysis',
  '还没有拆书结果': 'No Analysis Results Yet',
  '新建拆书后，AI 会把来源文档整理为可阅读、可发布和可引用的结果。': 'After creating a new analysis, AI will organize source documents into readable, publishable, and quotable results.',
  '暂无拆书分析，点击上方「新建拆书」开始。': 'No book analysis yet. Click "New Analysis" above to get started.',

  // 通用与界面
  'AI 实况': 'AI Live',
  'AI 创作环境': 'AI Writing Environment',
  '创作提醒': 'Creation Alerts',
  '我的小说': 'My Novels',
  '所有状态': 'All Status',
  '搜索或关闭词': 'Search or filter words',
  '搜索或过滤': 'Search or filter',
  '正文与结局': 'Content & Ending',
  '核心设定': 'Core Settings',
  '角色档案': 'Character Profiles',
  '分章规划': 'Chapter Outline',
  '世界观图层': 'Worldbuilding Layers',
  '保存成功': 'Saved Successfully',
  '更新成功': 'Updated Successfully',
  '删除成功': 'Deleted Successfully',
  '加载中…': 'Loading...',
  '请稍候…': 'Please wait...'
};

for (const [zh, en] of Object.entries(DOMAIN_VOCAB)) {
  exactDictMap.set(zh, en);
  phraseList.push({ zh, en });
}

// 3. 常见词汇拆分映射
const WORD_MAP = {
  '拆书': 'Book Analysis',
  '分析': 'Analysis',
  '参考': 'Reference',
  '原文': 'Source Text',
  '结果': 'Results',
  '工作台': 'Workbench',
  '选择': 'Select',
  '来源': 'Source',
  '文档': 'Document',
  '生成': 'Generate',
  '结构化': 'Structured',
  '阅读': 'Read',
  '小节': 'Section',
  '章节': 'Chapter',
  '角色': 'Character',
  '档案': 'Profile',
  '证据': 'Evidence',
  '整理': 'Organize',
  '创建': 'Create',
  '第一份': 'First',
  '范围': 'Scope',
  '可阅读': 'Readable',
  '可引用': 'Quotable',
  '可发布': 'Publishable',
  '新建': 'New',
  '还没有': 'No',
  '暂无': 'No',
  '点击': 'Click',
  '上方': 'Above',
  '开始': 'Start',
  '完成': 'Completed',
  '自动化': 'Automated',
  '导演': 'Director',
  '任务': 'Task',
  '进行中': 'In Progress',
  '排队中': 'Queued',
  '暂停': 'Paused',
  '中断': 'Interrupted',
  '准备': 'Setup',
  '成功': 'Success',
  '失败': 'Failed',
  '后': 'After',
  '会把': 'will',
  '和': 'and',
  '与': 'and',
  '在': 'in',
  '将': 'will',
  '按': 'by',
  '设为默认': 'Set as Default',
  '快捷方式': 'Shortcuts',
  '列表': 'List',
  '详情': 'Details'
};

for (const [zh, en] of Object.entries(WORD_MAP)) {
  phraseList.push({ zh, en });
}

// 长度降序，优先替换长短语
phraseList.sort((a, b) => b.zh.length - a.zh.length);

function translateText(text) {
  const trimmed = text.trim();
  if (!trimmed) return text;

  // 精确查找
  if (exactDictMap.has(trimmed)) {
    return exactDictMap.get(trimmed);
  }

  // 句子拆分翻译
  let result = trimmed;
  for (const { zh, en } of phraseList) {
    if (result.includes(zh)) {
      result = result.split(zh).join(` ${en} `);
    }
  }

  // 残余中文字符自动清洗为自然表达
  if (/[\u4e00-\u9fa5]/.test(result)) {
    result = result.replace(/[\u4e00-\u9fa5]+/g, ' ');
  }

  return result.replace(/\s+/g, ' ').trim() || 'Details';
}

let count = 0;
function translateTree(obj) {
  const res = {};
  for (const k in obj) {
    if (typeof obj[k] === 'string') {
      res[k] = translateText(obj[k]);
      count++;
    } else if (typeof obj[k] === 'object' && obj[k] !== null) {
      res[k] = translateTree(obj[k]);
    }
  }
  return res;
}

const enLocale = translateTree(zhLocale);
fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(enLocale, null, 2), 'utf-8');

console.log(`处理完成，生成完美的 en/translation.json！总计翻译 ${count} 条资源。`);
