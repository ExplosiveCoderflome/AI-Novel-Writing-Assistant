# LLM 限速器内存泄漏与淘汰机制

## 背景

`server/src/llm/requestLimiter.ts` 维护一个全局 `sharedLimiters: Map<string, ProviderModelRequestLimiter>`。Map 的 key 是 `provider:model:concurrencyLimit:requestIntervalMs` 的复合字符串。

每次用户在设置页修改 provider 的并发数或请求间隔，`concurrencyLimit`/`requestIntervalMs` 发生变化，`getLimiterKey` 会生成新 key，旧 key 的 entry 留在 Map 里永不淘汰。长期运行后 Map 会持续增长，造成内存泄漏。

## 决策

新增 `evictSharedLimiters(provider: string)` 导出函数：遍历 Map，删除所有以 `provider:` 开头的 key。

持有旧实例引用的 LLM 客户端仍可正常完成在途请求（引用不被释放），新请求使用新配置创建的实例——无请求中断风险。

淘汰调用点放在 **routes 层**，与 `setProviderSecretCache` 共同触发：

| 调用位置 | 触发场景 |
|----------|----------|
| `server/src/routes/settings.ts` | 内置 provider upsert（含启用/停用） |
| `server/src/routes/settings/customProviderRoutes.ts` | 自定义 provider 删除 |

## 当前规则

- `evictSharedLimiters` 只放 routes 层，不放 SecretStore 层（SecretStore 是数据访问层，不应感知 LLM 子系统内部）
- 任何涉及 provider 配置变更的 route 都需要在 `setProviderSecretCache` 之后调用 `evictSharedLimiters`
- 若未来在 routes 层以外新增 provider 配置变更路径，同样需要同步调用淘汰

## 失败模式

- **淘汰时机晚于请求**：极低概率——配置变更和旧 limiter 调用之间有竞态，但旧 limiter 实例不会因淘汰而失效，在途请求仍会完成。
- **遗漏调用点**：如果新增 provider 配置路由忘记调用 `evictSharedLimiters`，旧 entry 仍会累积。建议：grep `setProviderSecretCache` 调用点时同步检查是否有配对的 `evictSharedLimiters`。

## 关联文件

- `server/src/llm/requestLimiter.ts` — `sharedLimiters` Map、`evictSharedLimiters`
- `server/src/routes/settings.ts` — 内置 provider 配置变更
- `server/src/routes/settings/customProviderRoutes.ts` — 自定义 provider 删除
