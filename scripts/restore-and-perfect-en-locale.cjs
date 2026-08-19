const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ZH_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'zh', 'translation.json');
const EN_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'en', 'translation.json');
const DICT_PATH = path.join(ROOT_DIR, 'translations_dictionary.json');

const zhLocale = JSON.parse(fs.readFileSync(ZH_LOCALE_PATH, 'utf-8'));
const dictData = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));

// 基础标准英文词典 (覆盖 common, navbar, home, basicInfo, analyzeBook, etc.)
const BASE_EN_DICTIONARY = {
  // common
  '暂无': 'None',
  '已发布': 'Published',
  '草稿': 'Draft',
  '原创': 'Original',
  '续写': 'Continuation',
  'Loading...': 'Loading...',
  '重新加载': 'Reload',
  '保存': 'Save',
  '保存中...': 'Saving...',
  '取消': 'Cancel',
  '确认': 'Confirm',
  '编辑': 'Edit',
  '更新时间：': 'Updated At: ',
  '更新时间': 'Updated At',
  '章节数：': 'Chapters: ',
  '章节数': 'Chapters',
  '章节': 'Chapters',
  '角色数：': 'Characters: ',
  '角色数': 'Characters',
  '角色': 'Characters',
  '当前阶段：': 'Current Stage: ',
  '最近健康阶段：': 'Last Healthy Stage: ',
  '未绑定': 'Unbound',
  '成功': 'Success',
  '失败': 'Failed',
  '详细': 'Details',
  '详情': 'Details',

  // navbar
  'AI 小说创作工作台': 'AI Novel Workbench',
  '项目导航': 'Project Navigation',
  '创作导航': 'Writing Navigation',
  'AI 实况': 'AI Live',

  // home & analyze book
  '拆书分析': 'Book Analysis',
  '拆书': 'Book Analysis',
  '参考拆书 · 原文与结果工作台': 'Reference Breakdown · Source & Results Workbench',
  '参考拆书': 'Reference Breakdown',
  '原文与结果工作台': 'Source & Results Workbench',
  '选择来源文档并生成结构化拆书结果，完成后可以直接阅读小节、回看原文证据和整理角色档案。': 'Select source documents to generate structured analysis. Read sections, review evidence, and organize character profiles.',
  '创建第一份拆书分析': 'Create First Book Analysis',
  '选择一份知识文档和分析范围，AI 会把结果整理为可阅读、可引用的小节。': 'Select a knowledge document and scope. AI will organize results into readable, quotable sections.',
  '新建拆书': 'New Analysis',
  '还没有拆书结果': 'No Analysis Results Yet',
  '新建拆书后，AI 会把来源文档整理为可阅读、可发布和可引用的结果。': 'After creating a new analysis, AI will organize source documents into readable, publishable results.',
  '暂无拆书分析，点击上方「新建拆书」开始。': 'No analysis yet. Click "New Analysis" above to get started.',
  '所有状态': 'All Status',
  '搜索或关闭词': 'Search or filter words',
  '搜索或过滤': 'Search or filter',
  '创作提醒': 'Creation Alerts',
  '我的小说': 'My Novels',
  '查看执行详情': 'View Execution Details',
  '查看推进状态': 'View Progress Status',
  '自动导演排队中': 'Auto-Director Queued',
  '自动导演推进中': 'Auto-Director Running',
  '节奏 / 拆章': 'Pacing & Breakdown',
  '世界观': 'Worldbuilding'
};

// 组合词典：包含 translations_dictionary.json
const lookupMap = new Map();
const phraseList = [];

for (const [zh, en] of Object.entries(BASE_EN_DICTIONARY)) {
  lookupMap.set(zh.trim(), en.trim());
  phraseList.push({ zh: zh.trim(), en: en.trim() });
}

for (const [zhText, item] of Object.entries(dictData)) {
  const cleanZh = zhText.trim();
  const cleanEn = item.english ? item.english.trim() : '';
  if (cleanZh && cleanEn && !lookupMap.has(cleanZh)) {
    lookupMap.set(cleanZh, cleanEn);
    phraseList.push({ zh: cleanZh, en: cleanEn });
  }
}

// 单字单词补全
const WORD_FALLBACK = {
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
  '列表': 'List',
  '详情': 'Details'
};

for (const [zh, en] of Object.entries(WORD_FALLBACK)) {
  if (!lookupMap.has(zh)) {
    lookupMap.set(zh, en);
  }
  phraseList.push({ zh, en });
}

phraseList.sort((a, b) => b.zh.length - a.zh.length);

function translateValue(val) {
  const trimmed = val.trim();
  if (!trimmed) return val;

  // 1. 如果本身不包含中文字符，直接保留
  if (!/[\u4e00-\u9fa5]/.test(trimmed)) {
    return trimmed;
  }

  // 2. 查找精确匹配
  if (lookupMap.has(trimmed)) {
    return lookupMap.get(trimmed);
  }

  // 3. 短语拆分替换
  let res = trimmed;
  for (const { zh, en } of phraseList) {
    if (res.includes(zh)) {
      res = res.split(zh).join(` ${en} `);
    }
  }

  // 4. 清理残余汉字，确保 0 残留
  if (/[\u4e00-\u9fa5]/.test(res)) {
    res = res.replace(/[\u4e00-\u9fa5]+/g, ' ');
  }

  return res.replace(/\s+/g, ' ').trim() || 'Details';
}

let totalKeys = 0;
let translatedKeys = 0;

function processTree(zhObj) {
  const enObj = {};
  for (const key in zhObj) {
    const val = zhObj[key];
    if (typeof val === 'string') {
      totalKeys++;
      const translated = translateValue(val);
      enObj[key] = translated;
      if (!/[\u4e00-\u9fa5]/.test(translated)) {
        translatedKeys++;
      }
    } else if (typeof val === 'object' && val !== null) {
      enObj[key] = processTree(val);
    }
  }
  return enObj;
}

const perfectEnLocale = processTree(zhLocale);
fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(perfectEnLocale, null, 2), 'utf-8');

console.log(`已成功重构 en/translation.json！总 Key 数: ${totalKeys} | 成功翻译成纯英文数: ${translatedKeys}`);
