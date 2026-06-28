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
