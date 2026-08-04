const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 低耦合守卫：services/adaptation 是 drama/comic 共享改编基建层，
// 不得依赖任何上层领域（novel/drama/comic 的业务服务），
// 只允许依赖：prisma（基础设施）、prompting（通用）、services/image（通用）。
// NovelSourceAdapter 仅经 prisma 只读访问 novel 表，不 import 任何 novel 业务服务。
const ADAPTATION_SRC = path.join(__dirname, "..", "src", "services", "adaptation");

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

test("services/adaptation 不依赖 novel 领域业务服务（低耦合守卫）", () => {
  const files = collectTsFiles(ADAPTATION_SRC);
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
        violations.push(`${path.relative(ADAPTATION_SRC, file)} → ${match[1]}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `adaptation 层禁止 import novel 领域业务服务（NovelSourceAdapter 仅可经 prisma 只读）：\n${violations.join("\n")}`,
  );
});

test("services/adaptation 不依赖 drama/comic 服务实现（共享层不反向依赖上层）", () => {
  const files = collectTsFiles(ADAPTATION_SRC);
  if (files.length === 0) return;

  const importRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  const domainRe = /(^|\/)(?:drama|comic)(\/|$)/;
  const violations = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importRe.exec(src)) !== null) {
      const spec = match[1].toLowerCase();
      if (domainRe.test(spec)) {
        violations.push(`${path.relative(ADAPTATION_SRC, file)} → ${match[1]}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `adaptation 共享层禁止反向依赖 drama/comic 上层模块：\n${violations.join("\n")}`,
  );
});
