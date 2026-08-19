const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_SRC = path.join(ROOT_DIR, 'client', 'src');
const ZH_LOCALE_PATH = path.join(CLIENT_SRC, 'locales', 'zh', 'translation.json');
const EN_LOCALE_PATH = path.join(CLIENT_SRC, 'locales', 'en', 'translation.json');
const DICT_PATH = path.join(ROOT_DIR, 'translations_dictionary.json');

let zhLocale = JSON.parse(fs.readFileSync(ZH_LOCALE_PATH, 'utf-8'));
let enLocale = JSON.parse(fs.readFileSync(EN_LOCALE_PATH, 'utf-8'));
let dictData = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));

// 建立反向词典：中文 -> { key, english }
const zhToDictMap = new Map();
for (const [zhText, item] of Object.entries(dictData)) {
  if (item.key) {
    zhToDictMap.set(zhText.trim(), item);
  }
}

// 辅助：根据中文文本与位置生成良好的 semantic key
function toCamelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, idx) => (idx === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join('');
}

function generateSemanticKey(zhText, fallbackHash) {
  const cleanZh = zhText.trim();
  const dictItem = zhToDictMap.get(cleanZh);
  if (dictItem && dictItem.key && !dictItem.key.startsWith('gen_')) {
    return dictItem.key;
  }
  if (dictItem && dictItem.english) {
    const camel = toCamelCase(dictItem.english);
    if (camel && camel.length <= 30) return camel;
  }
  return `item_${fallbackHash}`;
}

// 收集所有 gen_* key 映射关系
const genKeyRemap = new Map(); // oldGenKey -> newSemanticKey

function getNestedValue(obj, keyPathStr) {
  const keys = keyPathStr.split('.');
  let current = obj;
  for (const k of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[k];
  }
  return current;
}

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

function deleteNestedKey(obj, keyPathStr) {
  const keys = keyPathStr.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) return;
    current = current[keys[i]];
  }
  delete current[keys[keys.length - 1]];
}

// 1. 递归遍历 zhLocale 中的 gen 命名空间，建立重命名列表
function traverseAndBuildRemap(obj, currentPath = []) {
  for (const [key, val] of Object.entries(obj)) {
    const keyPath = [...currentPath, key];
    if (typeof val === 'string') {
      const fullPath = keyPath.join('.');
      if (key.startsWith('gen_')) {
        const parentPath = currentPath.join('.');
        const semanticSubKey = generateSemanticKey(val, key.slice(4, 10));
        // 将 gen.xxx.gen_123 转化为 xxx.semanticSubKey
        let newKeyPath = parentPath.startsWith('gen.') ? parentPath.slice(4) + '.' + semanticSubKey : parentPath + '.' + semanticSubKey;
        genKeyRemap.set(fullPath, { newKeyPath, zhVal: val });
      }
    } else if (typeof val === 'object' && val !== null) {
      traverseAndBuildRemap(val, keyPath);
    }
  }
}

traverseAndBuildRemap(zhLocale);

console.log(`收集到 ${genKeyRemap.size} 个 gen_* 机器哈希键，准备重构成语义化 Key...`);

// 2. 迁移语言包中的 key
genKeyRemap.forEach(({ newKeyPath, zhVal }, oldKeyPath) => {
  const enVal = getNestedValue(enLocale, oldKeyPath) || zhVal;

  setNestedValue(zhLocale, newKeyPath, zhVal);
  setNestedValue(enLocale, newKeyPath, enVal);

  deleteNestedKey(zhLocale, oldKeyPath);
  deleteNestedKey(enLocale, oldKeyPath);
});

// 清理空的 gen 节点
if (zhLocale.gen && Object.keys(zhLocale.gen).length === 0) delete zhLocale.gen;
if (enLocale.gen && Object.keys(enLocale.gen).length === 0) delete enLocale.gen;

// 保存语言包
fs.writeFileSync(ZH_LOCALE_PATH, JSON.stringify(zhLocale, null, 2), 'utf-8');
fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(enLocale, null, 2), 'utf-8');

// 3. 全量替换源码中的 oldKeyPath
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'locales' && file !== '.git') {
        getAllFiles(filePath, fileList);
      }
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = getAllFiles(CLIENT_SRC);
let modifiedCount = 0;

files.forEach((filePath) => {
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;

  genKeyRemap.forEach(({ newKeyPath }, oldKeyPath) => {
    if (content.includes(oldKeyPath)) {
      content = content.split(oldKeyPath).join(newKeyPath);
    }
  });

  if (content !== original) {
    modifiedCount++;
    fs.writeFileSync(filePath, content, 'utf-8');
  }
});

console.log(`成功重构 ${genKeyRemap.size} 个 gen_* 机器键为语义化 Key，并更新了 ${modifiedCount} 个源文件！`);
