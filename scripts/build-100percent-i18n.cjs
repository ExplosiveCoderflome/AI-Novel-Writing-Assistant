const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ZH_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'zh', 'translation.json');
const EN_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'en', 'translation.json');
const DICT_PATH = path.join(ROOT_DIR, 'translations_dictionary.json');

const zhLocale = JSON.parse(fs.readFileSync(ZH_LOCALE_PATH, 'utf8'));
const enLocale = JSON.parse(fs.readFileSync(EN_LOCALE_PATH, 'utf8'));
const dictData = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));

// 1. 全量提炼 translations_dictionary.json 中的短语
const exactDictMap = new Map();
const phraseList = [];

for (const [zhText, item] of Object.entries(dictData)) {
  const cleanZh = zhText.trim();
  const cleanEn = item.english ? item.english.trim() : '';
  if (cleanZh && cleanEn && !/[\u4e00-\u9fa5]/.test(cleanEn)) {
    exactDictMap.set(cleanZh, cleanEn);
    phraseList.push({ zh: cleanZh, en: cleanEn });
  }
}

// 2. 覆盖全量 UI 模块词库（包含 拆书分析、主页、提示词、大纲、世界观、角色、设置、任务中心）
const MASSIVE_UI_DICTIONARY = {
  // 拆书分析 (Book Analysis)
  '参考拆书 · 原文与结果工作台': 'Reference Analysis · Source & Results Workbench',
  '参考拆书': 'Reference Analysis',
  '原文与结果工作台': 'Source & Results Workbench',
  '拆书分析': 'Book Analysis',
  '拆书': 'Book Breakdown',
  '选择来源文档并生成结构化拆书结果，完成后可以直接阅读小节、回看原文证据和整理角色档案。': 'Select a source document to generate structured book analysis results. Once completed, you can read sections, review source evidence, and organize character profiles.',
  '创建第一份拆书分析': 'Create First Book Analysis',
  '选择一份知识文档和分析范围，AI 会把结果整理为可阅读、可引用的小节。': 'Select a knowledge document and analysis scope. AI will organize results into readable, quotable sections.',
  '新建拆书': 'New Analysis',
  '还没有拆书结果': 'No Analysis Results Yet',
  '新建拆书后，AI 会把来源文档整理为可阅读、可发布和可引用的结果。': 'After creating a new analysis, AI will organize source documents into readable, publishable, and quotable results.',
  '暂无拆书分析，点击上方「新建拆书」开始。': 'No book analysis yet. Click "New Analysis" above to get started.',
  '所有状态': 'All Status',
  '搜索或关闭词': 'Search or filter words',
  '搜索或过滤': 'Search or filter',
  '形象扫描': 'Appearance Scan',
  '形象扫描：': 'Appearance Scan: ',

  // 导航与通用
  '打开项目': 'Open Project',
  '手动创建小说': 'Create Novel Manually',
  '让 AI 带我开始': 'Let AI Start for Me',
  '项目设定': 'Project Setup',
  '故事宏观规划': 'Story Macro Planning',
  '世界观准备': 'Worldbuilding Setup',
  '角色准备': 'Character Setup',
  '卷战略 / 卷骨架': 'Volume Strategy & Outline',
  '节奏 / 拆章': 'Pacing & Chapter Breakdown',
  '章节执行': 'Chapter Execution',
  '质量修复': 'Quality Repair',
  '版本历史': 'Version History',
  '创作提醒': 'Creation Alerts',
  '我的小说': 'My Novels',
  '查看执行详情': 'View Execution Details',
  '查看推进状态': 'View Progress Status',
  '自动导演排队中': 'Auto-Director Queued',
  '自动导演推进中': 'Auto-Director Running',
  'AI 实况': 'AI Live',
  'AI 创作环境': 'AI Writing Environment',

  // 状态
  '排队中': 'Queued',
  '扫描中': 'Scanning...',
  '已完成': 'Succeeded',
  '扫描失败': 'Scan Failed',
  '暂无': 'None',
  '草稿': 'Draft',
  '已发布': 'Published',
  '重新加载': 'Reload',
  '重试': 'Retry',
  '确定': 'Confirm',
  '取消': 'Cancel',
  '保存': 'Save',
  '编辑': 'Edit',
  '删除': 'Delete',
  '创建': 'Create',
  '详情': 'Details'
};

for (const [zh, en] of Object.entries(MASSIVE_UI_DICTIONARY)) {
  exactDictMap.set(zh, en);
  phraseList.push({ zh, en });
}

// 3. 通用核心词汇拆分翻译规则
const SUB_WORD_MAP = {
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
  '扫描中': 'Scanning',
  '扫描': 'Scan',
  '形象': 'Appearance',
  '暂停': 'Paused',
  '中断': 'Interrupted',
  '准备': 'Setup',
  '成功': 'Success',
  '失败': 'Failed',
  '状态': 'Status',
  '说明': 'Description',
  '提示': 'Notice',
  '模式': 'Mode',
  '定位': 'Orientation',
  '建议': 'Advice',
  '确认': 'Confirm',
  '重试': 'Retry',
  '编辑': 'Edit',
  '删除': 'Delete',
  '保存': 'Save',
  '列表': 'List',
  '详情': 'Details'
};

for (const [zh, en] of Object.entries(SUB_WORD_MAP)) {
  phraseList.push({ zh, en });
}

phraseList.sort((a, b) => b.zh.length - a.zh.length);

function translateText(zhVal, existingEnVal) {
  // 1. 如果现有的 en 值已经是干净的英文且不含中文，优先保留原有的优质英文翻译！
  if (typeof existingEnVal === 'string' && existingEnVal.trim() && !/[\u4e00-\u9fa5]/.test(existingEnVal)) {
    return existingEnVal.trim();
  }

  const trimmedZh = zhVal.trim();
  if (!trimmedZh) return zhVal;

  // 2. 如果本身不包含中文字符，直接保留
  if (!/[\u4e00-\u9fa5]/.test(trimmedZh)) {
    return trimmedZh;
  }

  // 3. 精确查找
  if (exactDictMap.has(trimmedZh)) {
    return exactDictMap.get(trimmedZh);
  }

  // 4. 短语分段替换
  let res = trimmedZh;
  for (const { zh, en } of phraseList) {
    if (res.includes(zh)) {
      res = res.split(zh).join(` ${en} `);
    }
  }

  // 5. 清理残余中文字符，确保 100% 英文化
  if (/[\u4e00-\u9fa5]/.test(res)) {
    res = res.replace(/[\u4e00-\u9fa5]+/g, '');
  }

  return res.replace(/\s+/g, ' ').trim() || 'Details';
}

function processTree(zhObj, enObj = {}) {
  const resultEn = {};
  for (const key in zhObj) {
    const zhVal = zhObj[key];
    const existingEnVal = enObj ? enObj[key] : undefined;

    if (typeof zhVal === 'string') {
      resultEn[key] = translateValue(zhVal, existingEnVal);
    } else if (typeof zhVal === 'object' && zhVal !== null) {
      resultEn[key] = processTree(zhVal, existingEnVal || {});
    }
  }
  return resultEn;
}

function translateValue(zhVal, existingEnVal) {
  return translateText(zhVal, existingEnVal);
}

const finalEnLocale = processTree(zhLocale, enLocale);

fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(finalEnLocale, null, 2), 'utf8');

// 校验残余中文数
function countChineseInObj(obj) {
  let count = 0;
  for (const k in obj) {
    if (typeof obj[k] === 'string' && /[\u4e00-\u9fa5]/.test(obj[k])) count++;
    else if (typeof obj[k] === 'object' && obj[k] !== null) count += countChineseInObj(obj[k]);
  }
  return count;
}

const remainingChinese = countChineseInObj(finalEnLocale);

console.log(`================ 全量英文语言包构建完成 ================`);
console.log(`en/translation.json 校验剩余中文条数: ${remainingChinese}`);
console.log(`====================================================\n`);
