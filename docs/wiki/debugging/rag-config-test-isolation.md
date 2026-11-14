# RAG 配置与测试隔离

## Background

桌面发布本地门禁 `pnpm test:all` 曾间歇失败于：

- `HybridRetrievalService retrieveByFacet applies facet filters`（`rows.length` 为 0）
- `restoring archived knowledge document queues a rebuild...`（`latestIndexStatus` 为 `idle`）
- `archiving knowledge document queues index cleanup...`（未 enqueue `delete`）

同签名可在 `RAG_ENABLED=false` 下稳定复现：`HybridRetrievalService` 与 `KnowledgeService` 队列逻辑都读取可变单例 `ragConfig.enabled`。

## Current Rule

- 依赖「RAG 已开启」的断言必须在用例内显式 `ragConfig.enabled = true`，并在 `finally` 恢复，不得假设进程启动默认值或环境未设置。
- 回归：`server/tests/testInfrastructure/ragConfigTestIsolation.test.js` 在清除 `NODE_TEST_CONTEXT` 后子进程以 `RAG_ENABLED=false` 启动上述套件，必须全绿。
- 子进程再跑 `node --test` 时必须删除 `NODE_TEST_CONTEXT` / `NODE_TEST_WORKER_ID`，否则 Node 会跳过文件并给出 recursive run 警告。

## Failure Modes

- 只跑两文件子集全绿、全量偶发失败：常见于启动环境或先前用例把 `ragConfig.enabled` 置于 false，而断言未钉死。
- 嵌套 `node --test` 看起来 exit 0 却几乎无输出：先查是否继承了 `NODE_TEST_CONTEXT`。

## Related Modules

- `server/src/config/rag.ts`
- `server/src/services/knowledge/KnowledgeService.ts`
- `server/src/services/rag/HybridRetrievalService.ts`
- `server/tests/knowledgeServiceStatus.test.js`
- `server/tests/bookAnalysis.test.js`
