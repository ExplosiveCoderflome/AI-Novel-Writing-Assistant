const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 反向边界守卫：novel 领域不得依赖任何改编模块（drama/comic/adaptation）。
// 确保 novel 核心在拆分时可独立交付，改编产线整体迁出后 novel 侧无须任何修改。
const NOVEL_SRC = path.join(__dirname, "..", "src", "services", "novel");

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

test("services/novel 不依赖改编模块（drama/comic/adaptation），保证 novel 可独立拆分", () => {
  const files = collectTsFiles(NOVEL_SRC);
  assert.ok(files.length > 0, "应能扫描到 novel 源文件");

  const importRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  const adaptationDomainRe = /(^|\/)(?:drama|comic|adaptation)(\/|$)/;
  const violations = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importRe.exec(src)) !== null) {
      const spec = match[1].toLowerCase();
      if (adaptationDomainRe.test(spec)) {
        violations.push(`${path.relative(NOVEL_SRC, file)} → ${match[1]}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `novel 领域禁止 import drama/comic/adaptation 改编模块：\n${violations.join("\n")}`,
  );
});
