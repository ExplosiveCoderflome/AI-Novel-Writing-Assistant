# 书级创作约定生成

## 职责

`BookContractGenerationService` 生成书级创作约定草稿，复用已注册的 `novel.director.book_contract` Prompt、上下文组装和结构化输出。通过 `index.ts` 使用，不导入导演阶段、运行时或任务控制服务。

调用方提供已整理的故事输入、项目上下文、候选方向、故事宏观规划和目标章数。输入来自当前工作流已保存的选择；该服务不读取或猜测导演运行状态。

## 边界

- `application/` 负责 Prompt 调用，保持温度默认值 0.4 与最大值 0.4；保留原有调用元数据。
- `domain/` 负责已结构化输出的确定性整理：文本去首尾空白，禁区去空、去重、最多保留 6 条。这不是创作语义判断。
- 生成不保存、不控制暂停或下一阶段。保存复用 `BookContractService.upsert`；导演执行器负责产物台账。
- 旧导演阶段负责进度跟踪和保存，旧 `normalizeBookContract` 导出仅作兼容转发。新导演步骤通过注入端口使用同一生成服务，保存返回当前书的有效记录后才返回产物引用。
- 本轮不改变 Prompt 文本、版本、Schema 或生成算法；现有 Prompt 的 Schema 来源保持兼容。

## 验证

`server/tests/bookContractGeneration.test.js` 覆盖 Prompt/上下文/模型参数、温度、输出整理、旧阶段调用顺序、错误传播和服务边界。新导演适配覆盖生成与保存顺序、运行身份覆盖及落账前保存校验；桩测试不证明真实 AI 生产完成。
