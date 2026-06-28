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

## GitHub Pages

`.github/workflows/site-pages.yml` 会在推送到 `main` 或手动触发时构建 `@ai-novel/site`，并把 `site/dist` 发布到 GitHub Pages。

## 文档入口

站点内置 `#/docs` 文档入口。公开文档通过 `src/docsManifest.ts` 白名单维护，来源限定为 `docs/public/` 下的用户向文档，以及 `docs/releases/release-notes.md`。

不要把整个 `docs/` 目录自动挂到公开站点，内部 wiki、`archive`、`checkpoints`、`plans` 和未整理的执行计划默认不展示。
