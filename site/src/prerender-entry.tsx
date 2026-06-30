import { renderToString } from "react-dom/server";
import App from "./App";
import { flattenedDocs } from "./docsManifest";
import { resolvePageMeta } from "./hooks/usePageMeta";
import type { PageMeta, ResolvedPageMeta } from "./hooks/usePageMeta";
import { parseRoute } from "./routing";

const docsIndexMeta: PageMeta = {
  title: "项目文档",
  description: "AI 小说创作工作台公开文档：安装、使用方法、自动导演阶段全景、章节执行链、按阶段恢复手册和模块说明。",
  canonicalPath: "/docs",
};

export type PrerenderResult = {
  html: string;
  head: ResolvedPageMeta;
};

export function getPrerenderRoutes(): string[] {
  return ["/", "/docs", ...flattenedDocs.map((doc) => `/docs/${doc.id}`)];
}

function getRouteMeta(pathname: string): PageMeta | null {
  const route = parseRoute(pathname);
  if (route.page === "home") {
    return null;
  }
  if (!route.docId) {
    return docsIndexMeta;
  }
  const activeDoc = flattenedDocs.find((doc) => doc.id === route.docId);
  if (!activeDoc) {
    return docsIndexMeta;
  }
  return {
    title: `${activeDoc.title} · ${activeDoc.categoryTitle}`,
    description: activeDoc.description,
    canonicalPath: `/docs/${activeDoc.id}`,
  };
}

export function renderRoute(pathname: string): PrerenderResult {
  return {
    html: renderToString(<App initialPath={pathname} />),
    head: resolvePageMeta(getRouteMeta(pathname)),
  };
}
