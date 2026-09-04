import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

test("project surfaces stay borderless and flat by default", () => {
  const card = read("card.tsx");
  assert.match(card, /border-transparent/);
  assert.match(card, /shadow-none/);
  assert.doesNotMatch(card, /rounded-xl border bg-card text-card-foreground shadow-sm/);
});

test("active design guidance keeps UI primitives project owned", () => {
  const design = read("../../../../docs/design/product-ui-design-system.md");
  const agents = read("../../../../AGENTS.md");
  assert.match(design, /Low-border Hierarchy/);
  assert.match(design, /禁止安装新的 shadcn\/ui 组件或运行其生成器/);
  assert.match(design, /普通 Surface\/Card 默认无可见边框和阴影/);
  assert.match(agents, /## UI Visual Rules/);
  assert.match(agents, /Default content surfaces must not render a visible border or shadow/);
});
