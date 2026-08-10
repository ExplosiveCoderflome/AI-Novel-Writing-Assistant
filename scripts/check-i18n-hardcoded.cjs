const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_SRC = path.join(ROOT_DIR, 'client', 'src');
const ZH_LOCALE_PATH = path.join(CLIENT_SRC, 'locales', 'zh', 'translation.json');

let zhLocale = {};
try {
  zhLocale = JSON.parse(fs.readFileSync(ZH_LOCALE_PATH, 'utf-8'));
} catch (e) {
  console.error('❌ 无法读取 zh/translation.json 语言包！');
  process.exit(1);
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

const CHINESE_RE = /[\u4e00-\u9fa5]/;

// ---------- 行级白名单：跳过不需要国际化的行 ----------
function shouldSkipLine(line, filePath) {
  const trimmed = line.trim();
  // 纯注释
  if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return true;
  // console 调试输出
  if (/\bconsole\.\w+\s*\(/.test(trimmed)) return true;
  // TypeScript 类型声明中的字面量联合
  if (/^\s*(?:export\s+)?type\s+\w+/.test(line)) return true;
  // 类型字面量行 (如 | "主角" | "配角")
  if (/^\s*\|\s*["']/.test(line)) return true;
  // i18n 工具文件自身
  if (filePath.endsWith('i18nUtils.ts') || filePath.endsWith('i18n.ts')) return true;
  // 标签库的标签数据文件（通常包含 isEn 逻辑但属于允许的例外）
  if (filePath.includes('visualAssetLibrary.labels.ts')) return true;
  return false;
}

// 检查一行移除已有 i18next.t() 调用后是否仍含中文
function hasRawChineseAfterI18n(line) {
  // 移除所有 i18next.t("...", ...) 调用
  let stripped = line.replace(/i18next\.t\(\s*["'][^"']*["'](?:\s*,\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}))?\s*\)/g, '');
  // 移除所有 t("...", ...) 调用
  stripped = stripped.replace(/\bt\(\s*["'][^"']*["'](?:\s*,\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}))?\s*\)/g, '');
  return CHINESE_RE.test(stripped);
}

const files = getAllFiles(CLIENT_SRC);
const errors = [];
const warnings = [];
let totalKeyChecks = 0;

files.forEach((filePath) => {
  const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // 全局白名单跳过
    if (shouldSkipLine(line, filePath)) return;

    const trimmed = line.trim();

    // ====== 1. 检查伪 Key gen_* ======
    if (line.includes('gen_') && (line.includes('i18next.t(') || line.includes('t('))) {
      const match = line.match(/(?:i18next\.)?t\(\s*["'`](gen\.[^"'`]+)["'`]/);
      if (match) {
        errors.push({
          file: relPath,
          line: lineNum,
          type: 'PSEUDO_KEY',
          message: `包含未重构的伪 Key (gen_*): ${trimmed.substring(0, 120)}`
        });
      }
    }

    // ====== 2. 检查 JSX 裸中文属性 ======
    const attrMatch = line.match(/\b(placeholder|title|description|label|tooltip|aria-label|alt|buttonText|helpText)=["']([^"']*[\u4e00-\u9fa5]+[^"']*)["']/);
    if (attrMatch) {
      errors.push({
        file: relPath,
        line: lineNum,
        type: 'HARDCODED_ATTR',
        message: `属性 ${attrMatch[1]} 中包含裸中文硬编码: "${attrMatch[2].substring(0, 60)}"`
      });
    }

    // ====== 3. 检查 i18next.t("key") 是否缺失 ======
    const keyMatch = line.match(/i18next\.t\(\s*["']([^"']+)["'](?:\s*,\s*([\s\S]+?))?\s*\)/);
    if (keyMatch) {
      const keyStr = keyMatch[1];
      const secondArg = keyMatch[2];
      if (!secondArg || !secondArg.trim()) {
        totalKeyChecks++;
        if (getNestedValue(zhLocale, keyStr) === undefined) {
          errors.push({
            file: relPath,
            line: lineNum,
            type: 'MISSING_KEY',
            message: `语言包 (zh/translation.json) 中缺失引用的 Key: "${keyStr}"`
          });
        }
      }
    }

    // ====== 4. 检查二元硬编码 isEn / startsWith("en") ======
    if ((line.includes('isEn ?') || line.includes('startsWith("en")') || line.includes("startsWith('en')")) && !filePath.includes('i18nUtils.ts') && !filePath.includes('visualAssetLibrary.labels.ts')) {
      errors.push({
        file: relPath,
        line: lineNum,
        type: 'BINARY_LANG_CHECK',
        message: `使用了二元语言硬编码判别 (isEn / startsWith('en')): ${trimmed.substring(0, 100)}`
      });
    }

    // ====== 5. 检查对象字面量中的中文 label/title/description ======
    const objLabelMatch = line.match(/\b(label|title|description|text|message|summary|heading)\s*:\s*["']([^"']*[\u4e00-\u9fa5]+[^"']*)["']/);
    if (objLabelMatch) {
      errors.push({
        file: relPath,
        line: lineNum,
        type: 'HARDCODED_OBJ_LABEL',
        message: `对象属性 ${objLabelMatch[1]} 中包含裸中文: "${objLabelMatch[2].substring(0, 60)}"`
      });
    }

    // ====== 6. 检查 return 语句中的中文字符串 ======
    const returnMatch = line.match(/\breturn\s+["']([^"']*[\u4e00-\u9fa5]+[^"']*)["']/);
    if (returnMatch) {
      // 跳过已经使用 i18next.t 的行
      if (!line.includes('i18next.t(')) {
        errors.push({
          file: relPath,
          line: lineNum,
          type: 'HARDCODED_RETURN',
          message: `return 语句包含裸中文: "${returnMatch[1].substring(0, 60)}"`
        });
      }
    }

    // ====== 7. 检查模板字面量中的中文 ======
    if (/`[^`]*[\u4e00-\u9fa5]+[^`]*`/.test(line)) {
      // 跳过已经被 i18next.t() 包裹的情况
      const withoutI18n = line.replace(/i18next\.t\([^)]*\)/g, '');
      if (/`[^`]*[\u4e00-\u9fa5]+[^`]*`/.test(withoutI18n)) {
        // 跳过 CSS class 模板字面量
        if (/\b(?:flex|grid|text-|bg-|border|rounded|px-|py-|gap-|items-|justify-|w-|h-)\b/.test(line)) return;
        // 跳过已经含 isEn 判断的行（属于 BINARY_LANG_CHECK 类别）
        if (line.includes('isEn')) return;
        // 跳过模板中已含 i18next.t 调用的混合行（已部分国际化）
        if (/`[^`]*i18next\.t\(/.test(line)) {
          warnings.push({
            file: relPath,
            line: lineNum,
            type: 'PARTIAL_I18N_TEMPLATE',
            message: `模板字面量已部分国际化但仍有裸中文: ${trimmed.substring(0, 100)}`
          });
        } else {
          errors.push({
            file: relPath,
            line: lineNum,
            type: 'HARDCODED_TEMPLATE',
            message: `模板字面量包含裸中文: ${trimmed.substring(0, 100)}`
          });
        }
      }
    }

    // ====== 8. 检查 toast/confirm/alert 中的中文 ======
    const toastMatch = line.match(/\b(toast\.(?:success|error|info|warning|loading)|window\.confirm|window\.alert)\(\s*["']([^"']*[\u4e00-\u9fa5]+[^"']*)["']/);
    if (toastMatch) {
      errors.push({
        file: relPath,
        line: lineNum,
        type: 'HARDCODED_TOAST',
        message: `${toastMatch[1]}() 包含裸中文: "${toastMatch[2].substring(0, 60)}"`
      });
    }

    // ====== 9. 检查 Record/Map 对象值中的中文 ======
    // 如 { pending: "待生成" } — 不在 label/title 等已覆盖的 prop 名中
    const recordMatch = line.match(/(\w+)\s*:\s*["']([\u4e00-\u9fa5][\u4e00-\u9fa5\w\s]{0,40})["']/);
    if (recordMatch) {
      const propName = recordMatch[1];
      // 排除已经由 Pass 5 覆盖的属性名
      if (!['label', 'title', 'description', 'text', 'message', 'summary', 'heading', 'name', 'placeholder', 'tooltip', 'buttonText', 'helpText'].includes(propName)) {
        // 排除 import/from/type 等
        if (!trimmed.startsWith('import') && !trimmed.startsWith('export type') && !trimmed.startsWith('type ')) {
          errors.push({
            file: relPath,
            line: lineNum,
            type: 'HARDCODED_RECORD',
            message: `对象值 ${propName}: "${recordMatch[2].substring(0, 40)}" 包含裸中文`
          });
        }
      }
    }

    // ====== 10. 检查 throw new Error 中的中文 ======
    const throwMatch = line.match(/throw\s+new\s+Error\(\s*["']([^"']*[\u4e00-\u9fa5]+[^"']*)["']/);
    if (throwMatch) {
      errors.push({
        file: relPath,
        line: lineNum,
        type: 'HARDCODED_THROW',
        message: `Error 消息包含裸中文: "${throwMatch[1].substring(0, 60)}"`
      });
    }
  });
});

// 将 BINARY_LANG_CHECK 从阻塞错误转为警告
const blockingErrors = errors.filter(e => e.type !== 'BINARY_LANG_CHECK');
const binaryLangWarnings = errors.filter(e => e.type === 'BINARY_LANG_CHECK');
const allWarnings = [...warnings, ...binaryLangWarnings];

console.log('\n================ 国际化质量卡口校验 (check:i18n) ================');
console.log(`扫描文件: ${files.length} | 校验 Key 引用数: ${totalKeyChecks}`);

if (allWarnings.length > 0) {
  const warnByType = {};
  for (const w of allWarnings) {
    warnByType[w.type] = (warnByType[w.type] || 0) + 1;
  }
  console.log('\n⚠️  警告（不阻塞构建，建议后续修复）:');
  for (const [type, count] of Object.entries(warnByType)) {
    console.log(`  ${type}: ${count}`);
  }
}

if (blockingErrors.length > 0) {
  const byType = {};
  for (const err of blockingErrors) {
    byType[err.type] = (byType[err.type] || 0) + 1;
  }
  console.log('\n阻塞问题统计:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.error(`\n❌ 发现 ${blockingErrors.length} 处阻塞性国际化问题:\n`);
  blockingErrors.slice(0, 50).forEach((err) => {
    console.error(`  [${err.type}] ${err.file}:${err.line} - ${err.message}`);
  });
  if (blockingErrors.length > 50) {
    console.error(`  ...以及其余 ${blockingErrors.length - 50} 处问题。`);
  }
  console.error('\n💡 提示: 请运行 "pnpm i18n:scan" 自动提炼硬编码中文与更新语言包。');
  process.exit(1);
} else {
  console.log(`\n✅ 阻塞性国际化问题: 0。 ${allWarnings.length > 0 ? `(仍有 ${allWarnings.length} 条警告需后续修复)` : ''}`);
  console.log('所有代码硬编码与 Key 覆盖率校验通过！\n');
  process.exit(0);
}
