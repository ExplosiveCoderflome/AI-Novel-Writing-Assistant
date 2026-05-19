# Server Architecture Migration Plan

## Background

`server/src` 现在同时存在 `routes/`、`services/novel/`、`services/novel/director/`、`modules/`、`creativeHub/`、`graphs/` 和 `prompting/` 多套组织方式。长期累积后，边界最先坏掉的不是“目录名”，而是事实源、编排层、HTTP 层和平台层开始互相承载职责。

## Target Shape

- `app/`：Express 装配、启动、后台 worker、watchdog、服务注册。
- `platform/`：`db`、`llm`、`events`、`runtime`、`config`、`prompting` 等基础设施。
- `modules/`：按业务域收敛，优先围绕 `setup`、`planning`、`production`、`director`、`characters`、`state`、`export`。

## Migration Rules

- 新能力不再堆进旧根目录。
- `routes` 只做 HTTP 映射，不承载核心编排。
- `prompting` 是产品级 prompt 的唯一入口。
- 迁移优先保持 API、数据语义和对外行为不变。
- 第一轮不改数据库 schema。

## Phased Plan

1. 冻结旧入口，停止继续扩写 `services/novel` 和 `services/novel/director` 根目录。
2. 拆 `NovelWorkflowService`，先分出 `store`、`healing`、`application`；`projection` 相关读模型先由 `store` facade 承担，恢复逻辑通过共享 helper 去重。
3. 把 `NovelService` 的继承链改成显式组合门面。
4. 将 `novel.ts`、`world.ts`、`settings.ts`、`novelProductionRoutes.ts` 下沉到模块自有 `http/` 入口。
5. 拆 `app.ts`，把路由装配、后台服务启动、worker/watchdog 初始化分开。
6. 清理 `worldDraftGeneration.ts` 等直接 `getLLM()` 的产品路径，统一到 prompt registry。

## Execution Checklist

- [ ] 旧根目录停止新增同级大文件。
- [ ] `NovelWorkflowService` 迁出 read/store、healing、application 责任，并避免恢复逻辑在多个 service 里重复。
- [ ] `NovelService` 由继承改组合。
- [ ] `routes` 只保留 HTTP 映射与请求校验。
- [ ] `app.ts` 拆出启动装配层。
- [ ] 旧 `getLLM()` 产品路径迁入 prompt 治理入口。
- [ ] 每个阶段后做一次类型检查和关键链路冒烟验证。

## Acceptance Criteria

- 目录密度下降，单文件长度回到可维护区间。
- 外部依赖只看模块门面，不深链内部文件。
- workflow、director、prompting 的边界在 wiki 和代码里一致。
- 现有 API 和用户行为保持兼容。

## Risks

- workflow 和 director 的历史兼容路径较多，拆分时要保留门面导出。
- 路由和 service 的迁移不能同步破坏当前前端调用。
- prompt 迁移应优先修正治理入口，不要用字符串分支补洞。
