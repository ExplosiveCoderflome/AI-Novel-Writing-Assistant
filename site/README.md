# GitHub Pages 介绍网站

这个目录是项目的公开介绍站，使用 React + Vite 构建为静态文件，可由 GitHub Pages 托管。

## 本地预览

```bash
pnpm --filter @ai-novel/site dev
```

## 构建

```bash
pnpm --filter @ai-novel/site build
```

构建产物输出到 `site/dist`。

## 文档登记校验

公开文档入口由 `src/docsManifest.ts` 维护。新增公开文档后运行：

```bash
pnpm check:docs-manifest
```

校验会扫描 `docs/public/**/*.md` 和 `docs/releases/release-notes.md`，确认每个公开文档都已登记到 manifest，且没有登记不存在的文件。

## GitHub Pages

`.github/workflows/site-pages.yml` 会在推送到 `main` 或手动触发时构建 `@ai-novel/site`，并把 `site/dist` 发布到 GitHub Pages。

## 文档入口

站点内置 `#/docs` 文档入口。公开文档通过 `src/docsManifest.ts` 白名单维护，来源限定为 `docs/public/` 下的用户向文档、`docs/public/modules/` 下的侧栏模块介绍，以及 `docs/releases/release-notes.md`。

不要把整个 `docs/` 目录自动挂到公开站点，内部 wiki、`archive`、`checkpoints`、`plans` 和未整理的执行计划默认不展示。

新增模块文档的推荐流程：

1. 在 `docs/public/` 或 `docs/public/modules/` 下新增 Markdown 文件。
2. 在 `site/src/docsManifest.ts` 里登记 `id`、标题、描述和 `sourcePath`。
3. 需要在首页强化入口时，再更新 `site/src/App.tsx` 的文案或 teaser。
4. 运行 `pnpm check:docs-manifest`。
5. 运行 `pnpm --filter @ai-novel/site build`。

文档内容由 `src/docsContent.ts` 使用 Vite glob 自动加载，不需要为每篇 Markdown 手写 import。
