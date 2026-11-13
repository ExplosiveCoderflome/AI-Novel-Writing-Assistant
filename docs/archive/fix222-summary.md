# Issue #222 修复结论

原文：[开书向导按钮置灰且刷新丢失状态](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/issues/222)。通过 GitHub REST API `GET /repos/ExplosiveCoderflome/AI-Novel-Writing-Assistant/issues/222` 读取，未使用 gh。

## 根因与证据

主因分类：向导状态恢复闭环不完整，叠加提交校验缺少可见反馈。

- 第 4 步原先只接收 `canGenerate`。构想为空、版本不可用、正在生成、承接方案未采用中的任一条件不满足时，按钮都会置灰，但没有解释哪项条件未满足。
- 当前分支已有 `autoDirectorCreateDraft` 本机草稿，已保存构想、基础表单及步骤。因此不能把当前代码描述成“完全没有持久化”，也未在报告的 v0.6.3 安装版现场复现普通刷新后构想丢失。
- 已确认的恢复缺口：控制器把世界处理方式重新初始化为固定值；入口写法可覆盖草稿选择；本书问题管理未纳入草稿，且异步全局默认值可覆盖本次选择。
- 页面只以开书来源作为 React key，未包含任务身份。浏览器历史在相同来源的草稿页和任务链接之间切换时，组件会复用初始化后的内存状态，`useState` 不会重新读取草稿。正常导航路径可再次触发该恢复缺口。

## 修复

- 复用现有 localStorage 草稿及来源隔离规则，不引入依赖；保留构想、题材、推进方式、文风、世界、写法、导演版本、完成步骤与当前步骤，并补齐世界处理方式和本书问题管理的恢复。
- 草稿中的写法选择优先于入口默认值，包括用户明确清空写法的情况；全局问题管理默认值仅用于尚无选择的状态。
- 按来源和任务身份重建页面；任务创建成功后继续清理本机草稿，从服务端任务恢复构想和设置，补齐任务中的世界处理方式及问题管理读取。
- 用同一份前置校验结果决定按钮禁用及原因列表，同时展示多项缺失原因，并通过 `aria-describedby` 关联按钮。版本读取中、读取失败和所选版本不可用分别说明；失败时提供重试读取入口。
- 更新用户发布说明、README 最新更新及新手创作 wiki 的草稿恢复边界。

## 验证

- `pnpm --filter @ai-novel/shared build`：通过。
- `pnpm --filter @ai-novel/client typecheck`：通过。
- 相关测试：33 项通过，0 失败。包含新增的草稿到真实控制器恢复、空写法选择、按钮静态渲染与无障碍关联、版本读取中/失败及全部前置条件测试，以及既有草稿隔离/清理、步骤、题材选择、开书任务恢复、导演版本和工作台约束测试。

测试命令（在 `client` 目录执行）：

```powershell
node --experimental-strip-types --test tests/autoDirectorCreateRecovery.test.js tests/directorOpeningRestoration.test.js tests/autoDirectorFoundationSelectionContracts.test.js tests/autoDirectorWorkspaceUxContracts.test.js tests/directorVersion.test.js src/pages/novels/autoDirector/draft/autoDirectorCreateDraft.test.mjs src/pages/novels/autoDirector/domain/generationReadiness.test.mjs src/pages/novels/autoDirector/directorCreateStages.test.mjs src/pages/novels/autoDirector/creationFoundationPickerState.test.mjs
```

首次检查因缺少工作区依赖而未能执行；按锁文件安装客户端及共享包依赖、构建共享包后完成验证，未修改依赖声明或锁文件。

## 验收边界与交付

- 自动验证覆盖存储往返、重新挂载的控制器初始化和 HTML 静态渲染；历史任务身份由页面接线约束测试覆盖。按项目规则，实际刷新、浏览器前进后退及视觉交互由用户验收，未运行浏览器或截图测试。
- 建议在第 1～3 步填写构想、题材和写法，进入第 4 步后刷新，再离开并前进/后退返回，核对对应内容与步骤；空构想或版本接口失败时检查按钮旁的具体指引。
- 未改数据库、小说正文、AI 决策或质量门禁，也未触发模型生成。浏览器禁用/清空本地存储时，本机草稿仍受现有存储能力限制；不宣称已还原原安装版的现场存储失败原因。
- 提交范围仅为 #222，提交到当前 `fix/issue-222` 分支，不 push；工作区原有日志和提示文件不纳入提交。
