import { useEffect } from "react";

const DEFAULT_TITLE = "AI 小说创作工作台 · 从灵感、趋势或参考作品到整本小说";
const DEFAULT_DESCRIPTION =
  "从灵感、公开榜单或参考作品开书，让自动导演准备世界、角色和卷章任务，再选择简易创作持续推进或进入专业工作台接管；失败可从已保存进度恢复。";
const CANONICAL_BASE = "https://explosivecoderflome.github.io/AI-Novel-Writing-Assistant/";

function ensureMeta(selector: string, attribute: "name" | "property", key: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  return element;
}

function setMetaContent(attribute: "name" | "property", key: string, value: string) {
  const selector = `meta[${attribute}="${key}"]`;
  const element = ensureMeta(selector, attribute, key);
  element.setAttribute("content", value);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

export type PageMeta = {
  title?: string;
  description?: string;
  canonicalPath?: string;
};

export type ResolvedPageMeta = {
  title: string;
  description: string;
  canonical: string;
};

export function resolvePageMeta(meta: PageMeta | null | undefined): ResolvedPageMeta {
  const title = meta?.title ? `${meta.title} · AI 小说创作工作台` : DEFAULT_TITLE;
  const description = meta?.description ?? DEFAULT_DESCRIPTION;
  const canonical = meta?.canonicalPath
    ? `${CANONICAL_BASE}${meta.canonicalPath.replace(/^\//, "")}`
    : CANONICAL_BASE;

  return { title, description, canonical };
}

export function usePageMeta(meta: PageMeta | null | undefined) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const { title, description, canonical } = resolvePageMeta(meta);

    const previousTitle = document.title;
    document.title = title;
    setMetaContent("name", "description", description);
    setMetaContent("property", "og:title", title);
    setMetaContent("property", "og:description", description);
    setMetaContent("property", "og:url", canonical);
    setMetaContent("name", "twitter:title", title);
    setMetaContent("name", "twitter:description", description);
    setCanonical(canonical);

    return () => {
      document.title = previousTitle;
    };
  }, [meta?.title, meta?.description, meta?.canonicalPath]);
}
