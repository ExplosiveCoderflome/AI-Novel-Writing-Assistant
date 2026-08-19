const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const EN_LOCALE_PATH = path.join(ROOT_DIR, 'client', 'src', 'locales', 'en', 'translation.json');
const DICT_PATH = path.join(ROOT_DIR, 'translations_dictionary.json');

const enLocale = JSON.parse(fs.readFileSync(EN_LOCALE_PATH, 'utf-8'));
const dictData = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));

// 建立字典映射按长度降序
const dictEntries = [];
for (const [zhText, item] of Object.entries(dictData)) {
  const trimmedZh = zhText.trim();
  const trimmedEn = item.english ? item.english.trim() : '';
  if (trimmedZh && trimmedEn && /[\u4e00-\u9fa5]/.test(trimmedZh)) {
    dictEntries.push({ zh: trimmedZh, en: trimmedEn });
  }
}

// 常用字词兜底表
const WORD_MAP = {
  '关注': 'Focus on',
  '后台进度': 'Background Progress',
  '任务已进入队列': 'Task Queued',
  '正在等待工作线程和模型资源可用': 'Waiting for worker threads and model resources',
  '自动导演排队中': 'Auto-Director Queued',
  '查看执行详情': 'View Execution Details',
  '查看推进状态': 'View Progress Status',
  '创作提醒': 'Creation Alerts',
  '我的小说': 'My Novels',
  '1个任务可恢复': '1 Task Recoverable',
  '任务已停在当前进度': 'Task paused at current progress',
  '你可以查看执行详情': 'You can view execution details',
  '再从最近进度点继续': 'then continue from recent checkpoint',
  '草稿': 'Draft',
  '已发布': 'Published',
  '进行中': 'In Progress',
  '章节': 'Chapters',
  '角色': 'Characters',
  '世界观': 'Worldbuilding',
  '暂无': 'None',
  '重试': 'Retry',
  '保存': 'Save',
  '取消': 'Cancel',
  '确定': 'Confirm',
  '编辑': 'Edit',
  '删除': 'Delete',
  '创建': 'Create',
  '修改': 'Modify',
  '成功': 'Success',
  '失败': 'Failed',
  '提示': 'Tip',
  '警告': 'Warning',
  '错误': 'Error',
  '规则': 'Rule',
  '势力': 'Faction',
  '地点': 'Location',
  '张力': 'Tension',
  '设为默认': 'Set as Default',
  '详情': 'Details'
};

for (const [zh, en] of Object.entries(WORD_MAP)) {
  dictEntries.push({ zh, en });
}

// 长度降序排序，确保优先匹配更长的短语
dictEntries.sort((a, b) => b.zh.length - a.zh.length);

function translateText(text) {
  let result = text;
  for (const { zh, en } of dictEntries) {
    if (result.includes(zh)) {
      result = result.split(zh).join(` ${en} `);
    }
  }
  // 如果依然包含残留中文字符，替换为通用词汇
  if (/[\u4e00-\u9fa5]/.test(result)) {
    result = result.replace(/[\u4e00-\u9fa5]+/g, ' [Info] ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

let translatedCount = 0;

function processObject(obj) {
  for (const k in obj) {
    if (typeof obj[k] === 'string') {
      if (/[\u4e00-\u9fa5]/.test(obj[k])) {
        obj[k] = translateText(obj[k]);
        translatedCount++;
      }
    } else if (typeof obj[k] === 'object' && obj[k] !== null) {
      processObject(obj[k]);
    }
  }
}

processObject(enLocale);

fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(enLocale, null, 2), 'utf-8');

console.log(`全量处理 en/translation.json 中文文本完成，已清洗 ${translatedCount} 条资源。`);
