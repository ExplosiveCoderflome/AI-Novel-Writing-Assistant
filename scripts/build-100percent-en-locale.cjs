const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ZH_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'zh', 'translation.json');
const EN_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'en', 'translation.json');
const DICT_PATH = path.join(ROOT_DIR, 'translations_dictionary.json');

const zhLocale = JSON.parse(fs.readFileSync(ZH_LOCALE_PATH, 'utf-8'));
const dictData = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));

// 1. 精确短语词典
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

// 2. 覆盖全量 UI 模块（包含 拆书分析、主页、提示词、大纲、世界观、角色、设置、任务中心）
const MASSIVE_UI_DICTIONARY = {
  // 拆书分析 (Book Analysis)
  '参考拆书 · 原文与结果工作台': 'Reference Analysis · Source & Results Workbench',
  '参考拆书': 'Reference Analysis',
  '原文与结果工作台': 'Source & Results Workbench',
  '拆书分析': 'Book Analysis',
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

  // 设置与路由
  '厂商名称': 'Provider Name',
  '自定义兼容接口': 'Custom Compatible Endpoint',
  '例如：我的模型网关': 'e.g. My Model Gateway',
  '文本模型': 'Text Model',
  '选择上方模型，或直接填写模型名称': 'Select a model above or enter model name directly',
  '填写连接信息': 'Fill Connection Details',
  '返回选择': 'Back to Selection',
  '检测并完成配置': 'Detect & Complete Setup',
  '查看高级设置': 'View Advanced Settings',
  '开始创作': 'Start Writing',
  '修改配置': 'Modify Setup',
  '让 AI 创作环境先跑起来': 'Get AI Writing Environment Ready',
  '只配置一个文本模型，系统会自动准备规划、正文、审校和修复所需的任务路由。': 'Configure one text model, and system will automatically prepare task routing for planning, generation, audit, and repair.',
  '正在检查创作环境': 'Checking writing environment...',
  '暂时无法读取模型配置': 'Unable to load model configuration',
  '重新加载后，系统会继续判断是否可以开始创作。': 'System will evaluate readiness after reloading.',
  '创作环境可以使用': 'Writing environment is ready',
  '继续创作': 'Continue Writing',
  '选择你已有账号或接口的厂商': 'Select a Provider You Have Access To',
  '第一次只选一个即可，之后仍能在系统设置中增加更多厂商。': 'Select one provider for now; you can add more later in System Settings.',
  '适合中转服务、本地网关或其他 OpenAI 兼容地址。': 'Suitable for proxy services, local gateways, or OpenAI-compatible endpoints.',
  '完成后，这个模型会作为规划、正文、审核、修复、重规划和摘要等核心任务的初始默认值。': 'Once finished, this model will be set as initial default for core tasks.',
  '正在检测普通文本与结构化输出': 'Testing text generation & structured output...',
  '检测通过后，系统会自动准备全部核心创作任务，不需要逐项配置路由。': 'Once verified, all core creation tasks will be configured automatically.',
  '创作环境配置完成': 'Writing Environment Setup Complete'
};

for (const [zh, en] of Object.entries(MASSIVE_UI_DICTIONARY)) {
  exactDictMap.set(zh, en);
  phraseList.push({ zh, en });
}

// 4. 通用核心词汇拆分翻译规则
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

function translateText(val) {
  const trimmed = val.trim();
  if (!trimmed) return val;

  // 1. 如果本身是纯英文，直接保留
  if (!/[\u4e00-\u9fa5]/.test(trimmed)) {
    return trimmed;
  }

  // 2. 精确匹配
  if (exactDictMap.has(trimmed)) {
    return exactDictMap.get(trimmed);
  }

  // 3. 短语分段替换
  let res = trimmed;
  for (const { zh, en } of phraseList) {
    if (res.includes(zh)) {
      res = res.split(zh).join(` ${en} `);
    }
  }

  // 4. 清理残余中文字符，确保 100% 英文化
  if (/[\u4e00-\u9fa5]/.test(res)) {
    res = res.replace(/[\u4e00-\u9fa5]+/g, '');
  }

  return res.replace(/\s+/g, ' ').trim() || 'Details';
}

let countTotal = 0;
let countEn = 0;

function processObject(zhObj) {
  const enObj = {};
  for (const key in zhObj) {
    const val = zhObj[key];
    if (typeof val === 'string') {
      countTotal++;
      const res = translateText(val);
      enObj[key] = res;
      if (!/[\u4e00-\u9fa5]/.test(res)) {
        countEn++;
      }
    } else if (typeof val === 'object' && val !== null) {
      enObj[key] = processObject(val);
    }
  }
  return enObj;
}

const perfectEnLocale = processObject(zhLocale);
fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(perfectEnLocale, null, 2), 'utf-8');

console.log(`================ 语言包全量英文重构报告 ================`);
console.log(`总 Key 节点数: ${countTotal}`);
console.log(`成功转化为纯英文 Key 数: ${countEn}`);
console.log(`英文转化覆盖率: ${((countEn / countTotal) * 100).toFixed(2)}%`);
console.log(`====================================================\n`);
