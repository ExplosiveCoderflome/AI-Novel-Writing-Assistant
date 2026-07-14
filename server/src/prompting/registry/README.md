# Prompt Registry 模块边界

## Background

Prompt Registry 同时包含大量惰性加载清单和少量运行时缓存、校验逻辑。两类责任堆在同一文件会让每次新增或升级 Prompt 都继续扩大稳定运行时文件。

## Decision

- `promptAssetLoaderEntries.ts` 只维护 Prompt id/version 到惰性加载函数的声明清单。
- `../registry.ts` 负责重复注册检查、惰性加载、缓存、按 id/version 查询和公开 API。
- 外部模块继续从 `prompting/registry.ts` 导入，不深度依赖清单内部文件。

## Current Rule

1. 新 Prompt 或版本升级只修改加载清单，不在运行时注册逻辑中增加业务分支。
2. Prompt 声明版本、加载清单 key 和测试期望必须一致。
3. 清单保持惰性 require，避免启动时一次加载全部 Prompt 资产。
4. 注册运行时必须继续检查重复 key、资产实际版本漂移和缓存冲突。
