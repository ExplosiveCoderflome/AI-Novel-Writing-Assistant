const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 低耦合守卫：services/comic 是独立 bounded context，
// ① 禁止依赖 novel 领域（services/novel、modules/novel）
// ② 禁止依赖 drama 服务实现（services/drama 非 engine/ 子路径）
//    ——跨模块复用一律经由 services/adaptation 共享层
// 豁免：drama/engine/（rhythmEngine / paywallPlanPolicy）
//    是纯领域知识零外部依赖，按方案允许 comic 直接 import（暂未移至 adaptation/）
// 与 novel 的唯一接触点仍由 adaptation/source/NovelSourceAdapter 承担，
// comic 自身不得 import 任何含 "novel" 的模块路径。
const COMIC_SRC = path.join(__dirname, "..", "src", "services", "comic");

function collectTsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

test("services/comic 不依赖 novel 领域（低耦合守卫）", () => {
  const files = collectTsFiles(COMIC_SRC);
  // 目录尚未创建时跳过（P1 落地前占位守卫）
  if (files.length === 0) return;

  const importRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  const novelSegmentRe = /(^|\/)novel(\/|$)/;
  const violations = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importRe.exec(src)) !== null) {
      const spec = match[1].toLowerCase();
      if (novelSegmentRe.test(spec)) {
        violations.push(`${path.relative(COMIC_SRC, file)} → ${match[1]}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `comic 模块禁止 import novel 领域（仅可经 adaptation/source/NovelSourceAdapter → prisma 只读）：\n${violations.join("\n")}`,
  );
});

test("services/comic 不依赖 drama 服务实现（跨模块复用须经 adaptation 层）", () => {
  const files = collectTsFiles(COMIC_SRC);
  if (files.length === 0) return;

  const importRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  // 拦截绝对/相对路径中 services/drama 段，放行：
  //   - adaptation/ 路径（共享层）
  //   - drama/engine/ 路径（rhythmEngine / paywallPlanPolicy 纯领域知识，方案明确豁免）
  const dramaSegmentRe = /(^|\/)drama(\/|$)/;
  const exemptRe = /(^|\/)adaptation(\/|$)|(^|\/)drama\/engine\//;
  const violations = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importRe.exec(src)) !== null) {
      const spec = match[1].toLowerCase();
      if (dramaSegmentRe.test(spec) && !exemptRe.test(spec)) {
        violations.push(`${path.relative(COMIC_SRC, file)} → ${match[1]}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `comic 模块禁止直接 import drama 服务实现（drama/engine/ 豁免，共享能力请下沉到 services/adaptation/）：\n${violations.join("\n")}`,
  );
});
