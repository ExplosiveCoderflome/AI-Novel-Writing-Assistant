# Slim 响应返回前完成落盘与章节同步（issue #171）

## 背景

用户在节奏/拆章工作区点「生成下一段章节」，任务中心显示 `chapter_list`
任务已完成（消耗了 tokens 和时间），但界面上的章节标题纹丝不动，还是旧数据；
点「重生当前节奏段」同样无效；手动删除章节后重生，数据依然不对。

排查起点在客户端 `useVolumeGenerationMutation`
（`client/src/pages/novels/hooks/useNovelVolumePlanning.generation.ts`）：
`chapter_list` / `volume` 等高内存 scope 请求时带 `slimResponse: true`，
服务端只返回精简响应，客户端随后用 `getNovelVolumeWorkspace()` 重新读取
完整工作区，再调 `updateNovelVolumes` 保存（含章节执行区同步）。

问题在服务端 `POST /:id/volumes/generate`
（`server/src/modules/novel/planning/http/novelVolumeRoutes.ts`）：
`shouldPersistBeforeSlimVolumeResponse` 只对 `beat_sheet` / `rebalance` /
`chapter_detail` 返回 true，`chapter_list` / `volume` 生成完**不落盘**就直接
返回 slim。于是客户端重读拿到的是旧文档，随后的保存把旧文档又存了一遍，
内存里刚生成的新标题被无声丢弃。

## 决策

Slim 响应的隐含契约是「服务端已落盘，客户端重读即最新」。凡是走 slim 的
scope，都必须在返回 slim 之前完成落盘，否则客户端的「重读 + 保存」链路会
把生成结果丢弃，并表现为"生成了但没变化"。

## 当前规则

- `shouldPersistBeforeSlimVolumeResponse`
  （`server/src/modules/novel/planning/http/novelVolumeRoutes.ts`）对
  `beat_sheet` / `rebalance` / `chapter_detail` / `chapter_list` / `volume`
  返回 true。新增 scope 若走 slim，必须同步检查该函数。
- `chapter_list` / `volume` / `chapter_detail` 还必须在返回 slim 前同步章节执行区。
  `getVolumes()` 会从执行章节补齐工作区的标题等字段；只落盘而未同步时，客户端
  随后的重读会把旧标题写回工作区。
- 客户端收到 slim 后只重读并应用服务端结果；这些 scope 的保存与章节同步已由
  生成请求完成，不应再对重读结果发起第二次保存。
- 客户端 `shouldRequestSlimVolumeGenerationResponse` 与服务端的
  `shouldUseSlimVolumeGenerationResponse` / `isHighMemoryVolumeScope`
  决定哪些 scope 走 slim；两处名单变化时要一起复核落盘名单。

## 失败模式

- 现象「任务完成了但界面没变化」「重生不覆盖旧数据」，先查生成链路是否
  走了 slim，以及返回前是否落盘；不要先怀疑合并逻辑
  （`mergeChapterList` 在 #171 中经核查是正确的）。
- 用户因此反复点击，会在任务中心留下多个 `chapter_list` 执行记录，
  容易被误读为"一次点击调了两次接口"；先修丢弃问题，再看是否还有重复触发。
- 同一个 `chapter_list` Prompt 出现多条模型调用记录时，先检查语义校验重试事件。
  一次单节奏段生成只选择一个 beat，但业务校验未通过时允许重试；AI 实况中的
  「校验重试 N」标记用于区分重试与独立的第二次生成。

## 相关模块

- `server/src/modules/novel/planning/http/novelVolumeRoutes.ts`
  （`shouldUseSlimVolumeGenerationResponse` /
  `shouldPersistBeforeSlimVolumeResponse` /
  `shouldSyncSlimVolumeResponseToChapterExecution`）
- `client/src/pages/novels/hooks/useNovelVolumePlanning.generation.ts`
  （`shouldRequestSlimVolumeGenerationResponse` /
  `shouldAutoSyncGeneratedScope`）
- `server/tests/volumeSlimResponsePersistence.test.js`
