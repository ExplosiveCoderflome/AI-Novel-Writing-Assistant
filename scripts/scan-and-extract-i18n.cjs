const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_SRC = path.join(ROOT_DIR, 'client', 'src');
const ZH_LOCALE_PATH = path.join(CLIENT_SRC, 'locales', 'zh', 'translation.json');
const EN_LOCALE_PATH = path.join(CLIENT_SRC, 'locales', 'en', 'translation.json');
const DICT_PATH = path.join(ROOT_DIR, 'translations_dictionary.json');

// ---------- 1. 读取语言包与词典 ----------
let zhLocale = {};
let enLocale = {};
let dictData = {};

if (fs.existsSync(ZH_LOCALE_PATH)) {
  try {
    zhLocale = JSON.parse(fs.readFileSync(ZH_LOCALE_PATH, 'utf-8'));
  } catch (e) {
    console.error('无法解析 zh translation.json:', e);
  }
}

if (fs.existsSync(EN_LOCALE_PATH)) {
  try {
    enLocale = JSON.parse(fs.readFileSync(EN_LOCALE_PATH, 'utf-8'));
  } catch (e) {
    console.error('无法解析 en translation.json:', e);
  }
}

if (fs.existsSync(DICT_PATH)) {
  try {
    dictData = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));
  } catch (e) {
    console.error('无法解析 translations_dictionary.json:', e);
  }
}

// ---------- 2. 建立中文文本 -> Key 映射 ----------
const chineseToKeyMap = new Map();

function walkObject(obj, currentPath = []) {
  for (const [key, val] of Object.entries(obj)) {
    const keyPath = [...currentPath, key];
    if (typeof val === 'string') {
      const fullKeyPath = keyPath.join('.');
      if (val.trim() && !key.startsWith('gen_') && !fullKeyPath.includes('gen.') && !chineseToKeyMap.has(val.trim())) {
        chineseToKeyMap.set(val.trim(), fullKeyPath);
      }
    } else if (typeof val === 'object' && val !== null) {
      walkObject(val, keyPath);
    }
  }
}

walkObject(zhLocale);

// 从词典补充
for (const [zhText, item] of Object.entries(dictData)) {
  const trimmed = zhText.trim();
  if (trimmed && !chineseToKeyMap.has(trimmed) && item.key) {
    chineseToKeyMap.set(trimmed, `dict.${item.key}`);
  }
}

// ---------- 3. 工具函数 ----------
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

function getNestedValue(obj, keyPathStr) {
  const keys = keyPathStr.split('.');
  let current = obj;
  for (const k of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[k];
  }
  return current;
}

function findZhValueInLocale(keyPathStr) {
  let val = getNestedValue(zhLocale, keyPathStr);
  if (typeof val === 'string' && val.trim()) return val;

  const stripped = keyPathStr.replace(/^gen\.(?:components\.|pages\.|lib\.|hooks\.|app\.|api\.|store\.|mobile\.)?/, '');
  val = getNestedValue(zhLocale, stripped);
  if (typeof val === 'string' && val.trim()) return val;

  const lastKey = keyPathStr.split('.').pop();
  if (lastKey && lastKey.startsWith('gen_')) {
    let found = undefined;
    function searchObj(obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (k === lastKey && typeof v === 'string') {
          found = v;
          return;
        }
        if (typeof v === 'object' && v !== null) {
          searchObj(v);
          if (found) return;
        }
      }
    }
    searchObj(zhLocale);
    if (found) return found;
  }
  return undefined;
}

function getNamespaceFromFile(filePath) {
  const rel = path.relative(CLIENT_SRC, filePath).replace(/\\/g, '/');
  const parts = rel.split('/');
  if (parts[0] === 'components') {
    return parts[1] || 'components';
  } else if (parts[0] === 'pages') {
    return parts[1] || 'pages';
  } else if (parts[0] === 'hooks') {
    return 'hooks';
  } else if (parts[0] === 'store') {
    return 'store';
  } else if (parts[0] === 'api') {
    return 'api';
  } else if (parts[0] === 'mobile') {
    return 'mobile';
  } else if (parts[0] === 'lib') {
    return 'lib';
  }
  return 'app';
}

function getComponentSlug(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.charAt(0).toLowerCase() + base.slice(1);
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

function cleanChineseText(text) {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

function getOrCreateKey(cleanZh, ns, comp) {
  let keyPath = chineseToKeyMap.get(cleanZh);
  if (!keyPath) {
    const hashStr = simpleHash(cleanZh);
    keyPath = `${ns}.${comp}.${hashStr}`;
    chineseToKeyMap.set(cleanZh, keyPath);
  }

  if (!getNestedValue(zhLocale, keyPath)) {
    setNestedValue(zhLocale, keyPath, cleanZh);
    stats.newKeysAdded++;
  }
  if (!getNestedValue(enLocale, keyPath)) {
    const dictMatch = dictData[cleanZh];
    const enVal = dictMatch ? dictMatch.english : cleanZh;
    setNestedValue(enLocale, keyPath, enVal);
  }
  return keyPath;
}

// ---------- 4. 文件遍历 ----------
let stats = {
  filesProcessed: 0,
  filesModified: 0,
  genKeysReplaced: 0,
  rawChineseExtracted: 0,
  objLiteralsReplaced: 0,
  newKeysAdded: 0,
};

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
console.log(`找到 ${files.length} 个前端 TS/TSX 源文件进行全量扫描与替换...`);

files.forEach((filePath) => {
  stats.filesProcessed++;
  let content = fs.readFileSync(filePath, 'utf-8');
  let isModified = false;

  const ns = getNamespaceFromFile(filePath);
  const comp = getComponentSlug(filePath);

  // ====== Pass 1: 替换所有伪国际化 gen_* Key 引用 ======
  const genKeyRegex = /(?:i18next\.)?t\(\s*["'](gen\.[^"']+)["'](\s*,\s*[^)]+)?\)/g;
  content = content.replace(genKeyRegex, (match, genKeyPath, extraArgs) => {
    const zhVal = findZhValueInLocale(genKeyPath);
    if (typeof zhVal === 'string' && zhVal.trim()) {
      const cleanZh = cleanChineseText(zhVal);
      const newKeyPath = getOrCreateKey(cleanZh, ns, comp);
      stats.genKeysReplaced++;
      isModified = true;
      if (extraArgs) {
        return `i18next.t("${newKeyPath}"${extraArgs})`;
      }
      return `i18next.t("${newKeyPath}")`;
    }
    return match;
  });

  // ====== Pass 2: JSX 标签内的裸中文节点 ======
  // 如 >点击提交< 或 >加载中...</
  const jsxTextRegex = />([ \t\r\n]*[\u4e00-\u9fa5]+[^<>{}]*)</g;
  content = content.replace(jsxTextRegex, (match, rawText) => {
    const trimmed = cleanChineseText(rawText);
    if (!trimmed || trimmed.includes('{') || trimmed.includes('}')) return match;
    const keyPath = getOrCreateKey(trimmed, ns, comp);
    stats.rawChineseExtracted++;
    isModified = true;
    return `>{i18next.t("${keyPath}")}<`;
  });

  // ====== Pass 3: JSX 属性中的裸中文 ======
  // 如 placeholder="请输入描述"
  const jsxAttrRegex = /\b(placeholder|title|description|label|tooltip|aria-label|alt|buttonText|helpText)=["']([^"']*[\u4e00-\u9fa5]+[^"']*)["']/g;
  content = content.replace(jsxAttrRegex, (match, attrName, zhVal) => {
    const trimmed = cleanChineseText(zhVal);
    if (!trimmed) return match;
    const keyPath = getOrCreateKey(trimmed, ns, comp);
    stats.rawChineseExtracted++;
    isModified = true;
    return `${attrName}={i18next.t("${keyPath}")}`;
  });

  // ====== Pass 4: Toast / confirm / alert 调用 ======
  // 如 toast.success("重构成功"), window.confirm("确定删除？")
  const toastRegex = /\b(toast\.(?:success|error|info|warning|loading)|window\.confirm|window\.alert)\(\s*["']([^"']*[\u4e00-\u9fa5]+[^"']*)["']\s*\)/g;
  content = content.replace(toastRegex, (match, fnCall, zhVal) => {
    const trimmed = cleanChineseText(zhVal);
    if (!trimmed) return match;
    const keyPath = getOrCreateKey(trimmed, ns, comp);
    stats.rawChineseExtracted++;
    isModified = true;
    return `${fnCall}(i18next.t("${keyPath}"))`;
  });

  // ====== Pass 5: 安全的对象字面量属性 ======
  const objPropRegex = /\b(label|title|description|placeholder|tooltip|buttonText|helpText|heading|message|summary|status|name|text|reason|action|actionLabel|hint|subtitle|category|typeLabel|header|caption|idle|generating|done|error)(\s*:\s*)["']([^"'`]*[\u4e00-\u9fa5]+[^"'`]*)["']/g;
  content = content.replace(objPropRegex, (match, propName, separator, zhVal) => {
    const trimmed = cleanChineseText(zhVal);
    if (!trimmed) return match;
    if (match.includes('i18next.t') || match.includes('from ')) return match;
    const keyPath = getOrCreateKey(trimmed, ns, comp);
    stats.objLiteralsReplaced++;
    isModified = true;
    return `${propName}${separator}i18next.t("${keyPath}")`;
  });

  // ====== Pass 6: Return 语句中的硬编码字符串 ======
  const returnStrRegex = /\breturn\s+["']([^"']*[\u4e00-\u9fa5]+[^"']*)["'];?/g;
  content = content.replace(returnStrRegex, (match, zhVal) => {
    const trimmed = cleanChineseText(zhVal);
    if (!trimmed || match.includes('i18next.t')) return match;
    const keyPath = getOrCreateKey(trimmed, ns, comp);
    stats.rawChineseExtracted++;
    isModified = true;
    return `return i18next.t("${keyPath}");`;
  });

  // ====== Pass 7: throw new Error 消息 中的硬编码字符串 ======
  const throwErrRegex = /throw\s+new\s+Error\(\s*["']([^"']*[\u4e00-\u9fa5]+[^"']*)["']\s*\)/g;
  content = content.replace(throwErrRegex, (match, zhVal) => {
    const trimmed = cleanChineseText(zhVal);
    if (!trimmed || match.includes('i18next.t')) return match;
    const keyPath = getOrCreateKey(trimmed, ns, comp);
    stats.rawChineseExtracted++;
    isModified = true;
    return `throw new Error(i18next.t("${keyPath}"))`;
  });

  // ====== Pass 8: Record / Map 对象值 中的硬编码字符串 ======
  const recordValRegex = /(\b[a-zA-Z0-9_$]+\s*:\s*)["']([\u4e00-\u9fa5][\u4e00-\u9fa5\w\s\-\.\,\!\?]{0,50})["']/g;
  content = content.replace(recordValRegex, (match, prefix, zhVal) => {
    const trimmed = cleanChineseText(zhVal);
    if (!trimmed || match.includes('i18next.t') || match.includes('from ') || match.includes('import ')) return match;
    // 过滤 TypeScript 类型 / key-value 容易误伤的场景
    if (prefix.trim().startsWith('type') || prefix.trim().startsWith('export')) return match;
    const keyPath = getOrCreateKey(trimmed, ns, comp);
    stats.objLiteralsReplaced++;
    isModified = true;
    return `${prefix}i18next.t("${keyPath}")`;
  });

  // ====== Pass 9: 模板字面量中的硬编码中文 ======
  const templateLiteralRegex = /`([^`\n]*[\u4e00-\u9fa5]+[^`\n]*)`/g;
  content = content.replace(templateLiteralRegex, (match, rawBody) => {
    if (match.includes('i18next.t') || match.includes('console.') || match.includes('import')) return match;
    // 跳过 CSS class 或 SQL 等
    if (/\b(?:flex|grid|text-|bg-|border|rounded|px-|py-|gap-|items-|justify-|w-|h-)\b/.test(match)) return match;

    let zhTemplateStr = '';
    const params = [];
    let exprIdx = 1;
    let i = 0;
    let hasError = false;

    while (i < rawBody.length) {
      const exprStart = rawBody.indexOf('${', i);
      if (exprStart === -1) {
        zhTemplateStr += rawBody.slice(i);
        break;
      }
      zhTemplateStr += rawBody.slice(i, exprStart);

      let braceCount = 1;
      let exprEnd = exprStart + 2;
      while (exprEnd < rawBody.length && braceCount > 0) {
        if (rawBody[exprEnd] === '{') braceCount++;
        else if (rawBody[exprEnd] === '}') braceCount--;
        exprEnd++;
      }
      if (braceCount > 0) {
        hasError = true;
        break;
      }

      const exprCode = rawBody.slice(exprStart + 2, exprEnd - 1).trim();
      // 严格跳过包含复杂运算符、引号、嵌套 i18n 或逻辑运算的表达式，确保 100% 语法安全
      if (
        exprCode.includes('?') ||
        exprCode.includes(':') ||
        exprCode.includes('`') ||
        exprCode.includes('"') ||
        exprCode.includes("'") ||
        exprCode.includes('||') ||
        exprCode.includes('&&') ||
        exprCode.includes('??') ||
        exprCode.includes('i18next')
      ) {
        hasError = true;
        break;
      }

      const paramName = `val${exprIdx++}`;
      zhTemplateStr += `{{${paramName}}}`;
      params.push({ name: paramName, expr: exprCode });
      i = exprEnd;
    }

    if (hasError || !/[\u4e00-\u9fa5]/.test(zhTemplateStr)) return match;

    const trimmedZh = cleanChineseText(zhTemplateStr);
    const keyPath = getOrCreateKey(trimmedZh, ns, comp);
    stats.rawChineseExtracted++;
    isModified = true;

    if (params.length === 0) {
      return `i18next.t("${keyPath}")`;
    } else {
      const paramsObjStr = params.map(p => `${p.name}: ${p.expr}`).join(', ');
      return `i18next.t("${keyPath}", { ${paramsObjStr} })`;
    }
  });

  // 确保 import i18next
  if (isModified && content.includes('i18next.t(') && !content.includes('import i18next') && !content.includes('import i18n')) {
    content = `import i18next from "i18next";\n` + content;
  }

  if (isModified) {
    stats.filesModified++;
    fs.writeFileSync(filePath, content, 'utf-8');
  }
});

// ---------- 保存更新后的 JSON 语言包 ----------
fs.writeFileSync(ZH_LOCALE_PATH, JSON.stringify(zhLocale, null, 2), 'utf-8');
fs.writeFileSync(EN_LOCALE_PATH, JSON.stringify(enLocale, null, 2), 'utf-8');

console.log('\n================ 国际化全量扫描与重构处理报告 ================');
console.log(`处理文件总数: ${stats.filesProcessed}`);
console.log(`修改文件数: ${stats.filesModified}`);
console.log(`替换伪国际化 gen_* 键数: ${stats.genKeysReplaced}`);
console.log(`抽取裸中文节点与属性数: ${stats.rawChineseExtracted}`);
console.log(`抽取对象字面量属性数: ${stats.objLiteralsReplaced}`);
console.log(`新增并存入语言包 Key 数: ${stats.newKeysAdded}`);
console.log('========================================================\n');
