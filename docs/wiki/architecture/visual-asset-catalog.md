# 项目级视觉资源目录

## Background

角色图、封面、拆书外形图、漫画分镜和短剧关键帧都会产生可复用的图片，但它们由不同模块保存：一部分使用 `ImageAsset`，一部分把 URL 和版本历史保存在业务对象的 JSON 字段中。让每个页面各自查询图片会使作者无法统一浏览已有视觉资产，也让“选择一张图片作为参考图”的能力反复实现。

## Decision

视觉资源目录以 `VisualAssetProjection` 建立统一的可查询投影，而不合并、迁移或复制来源模块的文件与事实。每个来源 Adapter 将可用图片映射为相同的 `VisualAssetSelection`：它同时携带稳定的 `assetId`、可直接展示的 `url`、资源类型、来源、作用域与生成信息。

资源选择器保存或回传完整选择对象；调用方可以立即使用 `url`，也必须保留 `assetId` 以支持后续追溯、重选和存储实现调整。

## Current Rule

- 原始图片和业务事实仍归 `ImageAsset`、漫画、短剧等来源模块所有；资源目录只索引，不拥有文件生命周期。
- Adapter 只能收录状态为已完成且拥有有效 URL 的资源；损坏 JSON、缺失文件或单个来源异常不得中断整个目录。
- 目录同步必须幂等，以 `sourceDomain + sourceType + sourceId + sourceVersion` 唯一定位投影记录；历史版本可以独立展示。
- 资源库采用“浏览”与“选择”两个模式。选择模式只能返回调用方允许作用域和类型内的资源，浏览模式不承担底层删除或主图替换。
- 组件不得直接读取数据库模型或业务页面字段；前端只依赖项目级视觉资源 API 和共享选择协议。

## Failure Modes

- 直接扫描生成目录会遗漏远程对象存储、失去业务来源，也可能把已删除或临时文件暴露给用户。
- 强制所有模块改写为 `ImageAsset` 会扩大迁移风险，并破坏漫画、短剧已有的版本语义。
- 只回传 URL 会失去来源和引用关系；URL 存储策略改变后，调用方无法安全恢复。
- 在图库中直接删除来源文件会绕过来源模块的主图、版本历史和引用关系约束。

## Related Modules

- `shared/types/visualAsset.ts`
- `server/src/modules/visualAssets/`
- `client/src/components/visualAssets/`
- `server/src/services/image/`
- `server/src/services/comic/`
- `server/src/services/drama/`
