const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_SRC = path.join(ROOT_DIR, 'client', 'src');

function refactorFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (filePath.includes('i18nUtils.ts')) return;

  // 如果包含 isEn ? 或 startsWith("en")
  if (content.includes('isEn ?') || content.includes('startsWith("en")') || content.includes("startsWith('en')")) {
    let modified = false;

    // 如果未导入 resolveDisplayText，自动添加导入
    if (!content.includes('resolveDisplayText')) {
      const relImport = path.relative(path.dirname(filePath), path.join(CLIENT_SRC, 'lib', 'i18nUtils')).replace(/\\/g, '/');
      const importPath = relImport.startsWith('.') ? relImport : `./${relImport}`;
      content = `import { resolveDisplayText } from "${importPath}";\n` + content;
      modified = true;
    }

    // 匹配类似 label = isEn ? "English Text" : "中文文本" 或 isEn ? "English" : "中文"
    // 替换为 resolveDisplayText({ zh: "中文", en: "English" })
    content = content.replace(
      /isEn\s*\?\s*([`"])((?:(?!\1)[^\\]|\\.)*)\1\s*:\s*([`"])((?:(?!\3)[^\\]|\\.)*)\3/g,
      (match, q1, enText, q3, zhText) => {
        modified = true;
        return `resolveDisplayText({ zh: ${q3}${zhText}${q3}, en: ${q1}${enText}${q1} })`;
      }
    );

    // 匹配 i18n.language.startsWith("en") ? "English" : "中文"
    content = content.replace(
      /(?:i18n|i18next)\.language\.startsWith\(["']en["']\)\s*\?\s*([`"])((?:(?!\1)[^\\]|\\.)*)\1\s*:\s*([`"])((?:(?!\3)[^\\]|\\.)*)\3/g,
      (match, q1, enText, q3, zhText) => {
        modified = true;
        return `resolveDisplayText({ zh: ${q3}${zhText}${q3}, en: ${q1}${enText}${q1} })`;
      }
    );

    // 清理 const isEn = ... 声明
    content = content.replace(/const\s+isEn\s*=\s*(?:i18n|i18next)\.language\.startsWith\(["']en["']\);\s*/g, '');

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`已升级普适多语言解析器: ${path.relative(ROOT_DIR, filePath)}`);
    }
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        scanDir(fullPath);
      }
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      refactorFile(fullPath);
    }
  }
}

scanDir(CLIENT_SRC);
console.log('所有文件的二元 isEn 硬编码分支已升级完毕！');
