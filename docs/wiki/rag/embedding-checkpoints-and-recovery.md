# Embedding 断点与索引恢复

## 背景

长文档通常对应数千个分块。索引必须先完成 embedding，再向向量库及本地元数据写入；后段网络故障不应让前面已经成功返回的向量全部丢失。请求成功、索引写入成功、任务成功是三个不同的边界。

## 当前规则

- 数字环境变量缺失、空白或非法时使用声明的默认值；显式 `0` 仍按该设置的合法范围处理。不能把缺失值转换为零后再夹到最小值。
- 已保存的 AppSetting 优先于默认值。历史最小值也可能是用户主动选择，升级不能据数值自动覆盖它们。
- 仅索引调用传入 `checkpointScope`。查询和健康检查沿用普通 embedding 路径，不创建文档检查点。
- 检查点范围包含租户、owner 类型和 owner id；目标包含 provider、model、base URL、embedding version；实际输入正文只参与 SHA-256。文件不保存正文、API 密钥或完整 URL。
- 桌面检查点保存在应用 `data/rag-embedding-checkpoints/v1/`；Web 环境保存在服务端数据根目录下的同名目录。持久化用同目录临时文件加原子 rename；网络请求前先验证目录可写。
- 每个成功批次及自适应拆分后的成功子批次立即保存。后续 embedding、向量库或元数据写入失败，不清除这些结果。自动重试、进程重启后的恢复和源页面手动重建都可复用同范围、同目标、同输入的结果。
- 检查点保留七天，过期后可重新生成。更换输入、模型、endpoint 或 embedding version 会使用不同的结果。损坏的检查点必须显式报错，不能悄悄重复付费请求。
- 目录准备与过期文件扫描按存储实例执行一次，不能为每个分块扫描全部缓存文件。分块序号用 owner 计数器累计，不能重复扫描先前全部候选。
- HTTP 超时覆盖接收响应头、成功正文和错误正文。收到响应头并不表示请求完成。
- 返回数量必须完整；提供 index 时必须恰好覆盖所有输入，禁止混合缺失、重复或越界 index。全部省略 index 的兼容接口可按返回顺序处理。每个向量必须由有限数字组成，批内及跨批维度必须一致；跨批 provider/model 改变时终止本次索引。
- worker 首次轮询前先完成中断恢复；同一 worker 的设置暂停/启动不能重复恢复仍在执行的任务。达到尝试次数上限的 running/queued 任务不能继续发起请求；源页面的明确重建会创建正常的新任务。
- 失败状态保留已完成数、总数、阶段进度和错误。默认关闭详细日志时，失败及恢复警告仍应可见。

## 证据与限制

- 检查点证明客户端已经收到且保存了向量，不能证明服务商没有对丢失响应的请求收费。断网或进程在响应返回与落盘之间终止时，客户端无法保证计费恰好一次。
- 旧版本失败前只留在内存中的结果不能从任务进度还原；没有检查点的历史失败任务仍需重新生成缺失结果。
- 这不是数据库迁移或新向量集合。不修改用户正文、文档版本、旧集合维度或已有设置。回滚代码时旧版本忽略新增检查点目录即可。
- 知识文档的索引替换、旧块清理及租约约束见 [代次发布规则](./knowledge-index-publication.md)。其他 owner 的写入不在该发布路径范围内；不能据知识文档测试宣称全部索引链路已全面验证。

## 离线验证

`embeddingReliability.test.js` 验证部分成功保存、输入/模型/endpoint 隔离、结果校验、正文超时、429/鉴权重试边界和取消。
`ragWorkerRecovery.test.js` 验证恢复顺序、次数上限、退避和失败进度。
`ragIndexResumeSqlite.test.js` 用临时 SQLite 和 mock embedding/Qdrant 验证请求中断、向量写入失败、元数据写入失败后恢复及旧索引保护；该用例属于 integration 分组。

运行测试时必须显式使用临时 `DATABASE_URL`、`AI_NOVEL_RUNTIME` 和 `AI_NOVEL_APP_DATA_DIR`；不得以真实资料验证付费调用或重建真实索引。

## 相关模块

- `server/src/config/rag.ts`
- `server/src/services/rag/EmbeddingService.ts`
- `server/src/services/rag/indexing/`
- `server/src/services/rag/RagIndexService.ts`
- `server/src/services/rag/RagWorker.ts`
- [知识库与上下文组装](./knowledge-and-context-assembly.md)
