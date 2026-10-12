# AI 小说创作工作台英文命名与兼容边界

## Background

项目中文名为“AI 小说创作工作台”，早期英文展示使用 `AI Novel Production Engine`，仓库使用 `AI Novel Writing Assistant`。英文名称能说明品类，但缺少可被复述和持续积累的品牌识别；同时，产品能力已经从单次写作辅助扩展到自动导演、长篇规划、章节生产、状态回灌、质量修复和叙事资产管理。

## Decision

中文正式名继续使用 **AI 小说创作工作台**，英文正式名更新为 **Biz Novel Studio**。

命名分工如下：

- “AI 小说创作工作台”保持现有中文认知与功能定位。
- `Biz` 承载创作者身份与英文品牌记忆。
- `Novel Studio` 让首次接触者立即理解产品服务小说创作。
- `AI Novel Production Engine` 与 `AI Novel Writing Assistant` 作为旧英文展示名和仓库搜索词继续保留在公开元数据中。

## Current Rule

用户可见界面、桌面应用、公开介绍站和当前文档应优先组合显示：

> AI 小说创作工作台 / Biz Novel Studio

本次仅更新英文名，不应将“AI 小说创作工作台”描述为原名或旧名。空间有限的中文界面优先显示中文名，并在副标题或页面元数据中显示 `Biz Novel Studio`。

GitHub 仓库名、Pages 路径、应用数据目录、环境变量、内部包名和旧数据库识别信息继续保留既有技术名称。这些标识承担链接、升级、数据和自动化兼容职责，不应仅为视觉统一而修改。

仓库介绍、页面元数据和公开文档应继续保留 `AI Novel Writing Assistant`、`AI novel writing`、`长篇小说创作` 等品类关键词，让新品牌负责记忆，品类描述负责搜索发现。

## Failure Modes

- 只显示 `Biz Studio` 而不说明小说品类，首次访问者可能误解为商业咨询或通用设计工作室。
- 把“AI 小说创作工作台”标成旧名，会让中文用户误以为产品连中文品牌也发生了迁移。
- 为追求名称统一而修改本地数据目录或旧数据库标记，可能让升级后的用户看不到已有作品。
- 立即修改 GitHub 仓库名会改变 Pages 地址，并削弱既有链接和关键词入口。
- 把两个旧英文名长期放在导航主标题中，会削弱 `Biz Novel Studio` 的记忆度；旧名只用于兼容说明和搜索元数据。

## Related Modules

- `README.md`
- `client/src/components/layout/`
- `desktop/`
- `site/`
- `docs/public/`
- `server/src/runtime/appPaths.ts`
