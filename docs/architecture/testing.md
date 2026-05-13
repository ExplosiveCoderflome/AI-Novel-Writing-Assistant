# 后端测试基础设施

本仓库的长期业务逻辑主要在 [`server/tests/`](../../server/tests/) 下，使用 **Node 内置 `node:test`** 与 **`node:assert/strict`**。默认测试入口会先构建 `@ai-novel/shared` 与 `@ai-novel/server`，再运行日常快速测试。

## 运行方式

```bash
# 在仓库根目录（推荐）
pnpm test

# 仅运行后端快速测试
pnpm --filter @ai-novel/server test

# 已经构建过时，只运行后端快速测试文件
pnpm --filter @ai-novel/server test:node

# 运行真实 Prisma / 迁移 / 兼容性等重型集成测试
pnpm --filter @ai-novel/server test:integration

# 完整测试入口：后端快速测试 + 后端集成测试 + 客户端测试
pnpm test:all

# 仅运行客户端 node:test 合约测试
pnpm test:client
```

单次只跑某一文件示例：

```bash
cd server && pnpm run build && node --test tests/chapterLifecycleState.test.js
```

后端快速测试由 [`server/scripts/run-tests.cjs`](../../server/scripts/run-tests.cjs) 维护分组。默认 `test` 会排除真实 SQLite 链路、迁移烟测、RAG 兼容导入、提示词治理扫描等重型文件；这些文件仍由 `test:integration` 和 `test:all` 覆盖。客户端测试使用 Node 22 的 `--experimental-strip-types` 直接运行 TypeScript 源测试，不需要单独构建客户端。

## 覆盖重点

现有用例已覆盖包括但不限于：结构化 LLM 解析与降级（[`structuredInvoke.test.js`](../../server/tests/structuredInvoke.test.js)）、导演运行时与 Worker（[`directorRuntimeStore.test.js`](../../server/tests/directorRuntimeStore.test.js)、[`directorWorker.test.js`](../../server/tests/directorWorker.test.js)）、小说工作流恢复（[`novelWorkflowRecoveryNormalization.test.js`](../../server/tests/novelWorkflowRecoveryNormalization.test.js)）、提示词治理注册（[`prompting-governance.test.js`](../../server/tests/prompting-governance.test.js)）。

新增纯函数或状态时，请在 `tests/` 下增加对应 `*.test.js`，保持与既有风格一致：**先 `pnpm run build`**，再 **`require("../dist/...")`** 引用编译产物。

## 与其它质量门禁

根目录 `pnpm typecheck` / `pnpm lint` 与各包脚本互补；大改动Director/Prisma 时务必本地跑通 `pnpm test` 后再提交。
