# 国际化治理与模块解耦重构规范 Wiki

本文档记载项目在国际化治理（i18n）、生图模型解耦以及超长文件拆分重构中的架构设计规范与维护约定。

---

## 1. 国际化治理 (i18n Governance Rules)

### 1.1 校验卡口与扫描工具
- **自动提取**: 使用 `pnpm i18n:scan` 自动扫描 `client/src` 中包含中文字符串的 JSX 文本、属性、Record 对象值、`throw Error` 及模板字面量，自动维护 `zh/translation.json` 与 `en/translation.json`。
- **质量卡口**: 合并前必须通过 `pnpm i18n:check`。不允许直接手写裸中文或使用 `gen_*` 机械化伪 Key。

### 1.2 模板字面量提取规范
- 对于包含变量的字符串（如 `` `已审校 ${count} 章` ``），提取为带有插值参数的语义 KeyPath：
  ```tsx
  i18next.t("novels.reviewedCount", { count, defaultValue: "已审校 {{count}} 章" })
  ```
- 避免在 Key 中使用 `i18next.t` 嵌套字符串拼接。复杂逻辑应当通过参数映射或 Helper 函数输出。

---

## 2. 生图模型配置中心 (Image Model Registry)

### 2.1 架构设计
- 文件位置：[`client/src/lib/imageModelRegistry.ts`](file:///c:/Users/lilin/GeneralAgent/client/src/lib/imageModelRegistry.ts)
- **职责**: 统一收敛后端 API Keys 中支持生图的 Provider 与本地离线引擎（如 `ComfyUI`、`SenseNova`），提供声明式的合并与选择逻辑：
  ```tsx
  const providerChoices = resolveImageProviderOptions(apiKeysRes?.data ?? [], currentProvider);
  ```
- 避免在不同 UI 弹窗（如 `ImageModelSelector.tsx`、`ImageGenerationConfirmDialog.tsx`）中重复硬编码拼装 `"comfyui"` 或 `"sensenova"` 选项。

---

## 3. 模块化与文件长度边界

### 3.1 文件长度指标
- 单文件推荐长度 **~600 行**，硬上限 **700 行**。
- 当页面（如 [`NovelEdit.tsx`](file:///c:/Users/lilin/GeneralAgent/client/src/pages/novels/NovelEdit.tsx)）膨胀时，须将纯数据类型、通用工具函数及 UI 视图抽离至 dedicated 子文件：
  - 辅助解析与存储逻辑：[`novelEditHelpers.ts`](file:///c:/Users/lilin/GeneralAgent/client/src/pages/novels/novelEditHelpers.ts)
  - HTTP 路由校验 Schema：[`sandboxSchemas.ts`](file:///c:/Users/lilin/GeneralAgent/server/src/modules/setup/world/http/sandboxSchemas.ts)、[`comicSchemas.ts`](file:///c:/Users/lilin/GeneralAgent/server/src/modules/comic/http/comicSchemas.ts)

---

## 4. Git 规范与预发布分支

- 所有功能与重构代码优先在 feature 分支完成，通过 `pnpm typecheck` + `pnpm i18n:check` + `pnpm test` 后合并入 `beta` 分支，验证通过后再推进合并至 `main` 主分支。
