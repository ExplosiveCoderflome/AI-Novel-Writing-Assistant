# Biz Novel Studio 品牌命名与兼容边界

## Background

项目早期使用 `AI Novel Writing Assistant` 与“AI 小说创作工作台”作为名称。这些名称能直接说明品类，但缺少可被复述和持续积累的品牌识别；同时，产品能力已经从单次写作辅助扩展到自动导演、长篇规划、章节生产、状态回灌、质量修复和叙事资产管理。

## Decision

正式产品名为 **Biz Novel Studio**，日常简称为 **Biz Studio**。英文定位语使用 **AI-Native Novel Production Engine**，中文说明继续使用“AI 小说创作工作台”。

命名分工如下：

- `Biz` 承载创作者身份与长期品牌记忆。
- `Novel Studio` 让首次接触者立即理解产品服务小说创作。
- `AI-Native Novel Production Engine` 说明产品不是单次续写工具，而是整本小说生产系统。
- “AI 小说创作工作台”作为中文功能说明，不再承担独立品牌名称的职责。

## Current Rule

用户可见界面、桌面应用、公开介绍站和当前文档使用 **Biz Novel Studio**。需要解释用途时，可组合为：

> Biz Novel Studio — AI-Native Novel Production Engine

品牌切换期内，README、公开介绍站、安装文档和桌面启动入口应标注“原 AI Novel Writing Assistant / AI 小说创作工作台”，帮助旧用户确认这是同一项目。常驻导航以新品牌为主，避免两个名称长期并列竞争。

GitHub 仓库名、Pages 路径、应用数据目录、环境变量、内部包名和旧数据库识别信息继续保留既有技术名称。这些标识承担链接、升级、数据和自动化兼容职责，不应仅为视觉统一而修改。

仓库介绍、页面元数据和公开文档应继续保留 `AI Novel Writing Assistant`、`AI novel writing`、`长篇小说创作` 等品类关键词，让新品牌负责记忆，品类描述负责搜索发现。

## Failure Modes

- 只显示 `Biz Studio` 而不说明小说品类，首次访问者可能误解为商业咨询或通用设计工作室。
- 为追求名称统一而修改本地数据目录或旧数据库标记，可能让升级后的用户看不到已有作品。
- 立即修改 GitHub 仓库名会改变 Pages 地址，并削弱既有链接和关键词入口。
- 在同一界面并列使用多个主品牌，会继续造成用户无法准确复述产品名称。

## Related Modules

- `README.md`
- `client/src/components/layout/`
- `desktop/`
- `site/`
- `docs/public/`
- `server/src/runtime/appPaths.ts`
