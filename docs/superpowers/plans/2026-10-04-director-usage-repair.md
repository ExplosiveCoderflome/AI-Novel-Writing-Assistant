# 导演正文用量与补丁安全修复

**目标：** 先修复补丁冲突、章节预算归属和逐次流式日志，再减少同一调用中的重复上下文。

**范围与约束：** 在 refactor/director-rebuild 执行；不改真实数据库、不恢复暂停任务、不发起真实模型请求、不合并 beta。已有十份计划及交接文件保持原样。由当前代理独立执行。

## 第一阶段：修复

- [x] 在 server/tests/chapterPatchRepair.test.js 增加包含、交叉重叠与替换后引入同名目标的回归用例，先确认失败。
- [x] shared/types/chapterPatchRepair.ts 对原文定位全部补丁，校验互不重叠，成功后按位置倒序应用；失败返回完整原文。registered chapterPatchRepair prompt 要求合并重叠目标。
- [x] server/tests/directorNext/steps/chapterUsagePipeline.test.js 用真实质量闭合流程和受控规划/存储边界复现后续规划混入预算。
- [x] usage/DirectorChapterUsageBudget.ts 和 PipelineDirectorSnapshot.ts 增加可选的结束计数；NovelPipelineExecutor 在质量闭合的未来规划前持久化正文用量边界。历史计数不回填、不清零。
- [x] 新增 server/tests/llmDebugUsage.test.js，控制模型流和日志写入边界；debugLogging.ts 保留最终实际用量，累计流不重复相加，未报告保持未知。
- [x] batchOutcome.ts 传递保存的具体暂停原因，保持结构化安全决策不变。
- [x] 构建 shared/server，运行补丁、预算、日志和新导演批处理相关测试；更新 wiki、模块 README、发布说明，审查本阶段 diff 后提交。

## 第二阶段：上下文优化

- [x] 阅读 incident 中 writer、acceptance、repair、artifact、replan 的上下文构造，定位重复字段；只优化可证明重复的输入，不削除创作约束。
- [x] 增加真实 prompt 渲染回归测试，验证关键事实/章节任务/问题仍在且原文、问题清单仅注入一次。
- [x] 按阶段去重输入并紧凑序列化结构化上下文，维持 Prompt Registry 和版本契约。
- [x] 用受控渲染及既有日志只读回放量化输入字符差异；未真实调用不宣称实际 Token 节省。
- [x] 运行最窄充分验证，更新长期上下文规则与发布说明，审查本阶段 diff 后提交。

验证记录：shared/server 构建通过；第一阶段 47 个测试通过，再补充边界检查后预算测试 15 个通过；第二阶段联动验证 123 个通过、2 个原有拆书文本测试跳过。修正 prompting.test.js 中既有角色 Prompt 的过期版本引用为已注册版本，原注册、实名与性别约束断言保留。只读日志回放中七次结构化调用的格式示例减少 1845 字符；三份重复评估投影由 3596 降至 1638 字符。完整状态恢复的是此前被截掉的事实，不宣称整条链路净 Token 降幅。没有模型请求、数据库写入、任务恢复或分支合并。

## 验收

补丁不因前一补丁改变定位；冲突不产生部分正文。后续章节规划不增加已闭合章节的预算。每次流式调用的实际用量可查且不重复统计。安全暂停仍须用户显式恢复。测试无开发库写入与外部模型请求。
