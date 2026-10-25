# creative-profile

书级创作取向的读取、校验、序列化与阶段指导编译。纯函数入口 `index.ts` 不初始化数据库；需查询书籍的调用方显式使用 `loader.ts`。

## 存储和兼容

仅增加 `Novel.creativeProfileJson String?` 一个可空 TEXT 列，版本写在 JSON 的 `schemaVersion: 1` 中。PostgreSQL 与 SQLite 使用相同加列迁移。不要对已安装数据库自动运行本模块的迁移，不回填旧书或改正文。

- `unset`：空指导，不向旧提示插入新内容，沿用原网文行为。
- `valid`：只消费用户确认的结构化取向。网文连载保留；现代文学、文学化类型小说允许人物、关系、主题推进和多种收尾。现代文学不限定时代。
- `invalid`：中性指导和可见问题，不退回网文。UI 修改其他字段时省略该项；用户重新选择或明确清除才替换。损坏的导演任务种子要求重新选择，避免在错误取向下继续调用。

更新字段省略表示保留，`null` 表示明确清除；导演种子恢复同样保留这个区别。禁止根据题材名、平台或正文关键词推断取向。

## 入口和依赖

- `readStoredCreativeProfile`：读取 `unset | valid | invalid`。
- `serializeCreativeProfile`：校验后返回 `{ creativeProfileJson: string | null }`。
- `recoverCreativeProfilePreference`：显式选择优先，其次是已保存选择；损坏配置报错。
- `compileCreativeProfileGuidance`：编译定位、规划、正文、审阅、修文指导。
- `creativePromptGuidanceFromStored` / `creativePromptGuidanceFromProfile`：提示资产消费的最小合同。
- `applyCreativeBaselinePolicy`：文学取向下，默认禁止内省/议论等规则仅作风险；显式绑定的写法约束仍保留。

业务提示文本属于 `server/src/prompting/prompts/creativeProfile/`。本模块只编译已选择的值，不调用模型、不构建业务消息、不进行审美判定。

长期维护规则见 [创作取向、叙事策略与取名](../../../../../docs/wiki/prompts/creative-orientation-and-narrative-strategy.md)。
