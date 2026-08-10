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
  if (!current[keys[keys.length - 1]]) {
    current[keys[keys.length - 1]] = value;
  }
}

function getNestedValue(obj, keyPathStr) {
  const keys = keyPathStr.split('.');
  let current = obj;
  for (const k of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[k];
  }
  return current;
}

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
let addedKeysCount = 0;

files.forEach((filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  // 匹配 i18next.t("key", "fallback") 或 t("key", "fallback")
  const matches = content.matchAll(/(?:i18next|i18n|t)\.t\(\s*["']([^"']+)["'](?:\s*,\s*(?:["']([^"']+)["']|(\{[\s\S]*?\})))?\s*\)/g);
  for (const match of matches) {
    const keyStr = match[1];
    const fallbackText = match[2];

    if (getNestedValue(zhLocale, keyStr) === undefined) {
      const defaultValue = fallbackText || keyStr.split('.').pop() || 'Details';
      setNestedValue(zhLocale, keyStr, defaultValue);
      addedKeysCount++;
    }
  }
});

fs.writeFileSync(ZH_LOCALE_PATH, JSON.stringify(zhLocale, null, 2), 'utf8');

console.log(`存入缺失 Key 到 zh/translation.json 成功！共补全 ${addedKeysCount} 条缺失 Key。`);
