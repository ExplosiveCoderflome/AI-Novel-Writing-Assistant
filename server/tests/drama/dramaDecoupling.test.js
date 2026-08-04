const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 低耦合守卫：services/drama 是独立 bounded context，
// 禁止依赖 novel 领域（services/novel、modules/novel、相对 novel 路径）。
// 与 novel 的唯一接触点 NovelSourceAdapter 仅通过 prisma（基础设施）只读访问，
// 其 import 不应出现任何含 "novel" 的模块路径。
const DRAMA_SRC = path.join(__dirname, "..", "src", "services", "drama");

function collectTsFiles(dir) {
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

test("services/drama 不依赖 novel 领域（低耦合守卫）", () => {
  const files = collectTsFiles(DRAMA_SRC);
  assert.ok(files.length > 0, "应能扫描到 drama 源文件");

  const importRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  // 只拦「novel 作为完整路径段」的 import（指向 novel 领域目录），
  // 放行 drama 内部文件名含 novel 的情况（如 ./source/NovelSourceAdapter）。
  const novelSegmentRe = /(^|\/)novel(\/|$)/;
  const violations = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importRe.exec(src)) !== null) {
      const spec = match[1].toLowerCase();
      if (novelSegmentRe.test(spec)) {
        violations.push(`${path.relative(DRAMA_SRC, file)} → ${match[1]}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `drama 模块禁止 import novel 领域（仅可经 prisma 只读）：\n${violations.join("\n")}`,
  );
});
