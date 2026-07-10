import { useEffect } from "react";

const DEFAULT_TITLE = "AI 小说创作工作台 · 从一句灵感到一整本小说";
const DEFAULT_DESCRIPTION =
  "AI 小说创作工作台是面向长篇小说的 AI Native 开源生产系统：自动导演、世界观、角色、拆章、章节执行和质量修复串成一条可暂停可恢复的长篇生产链，帮助新手把想法推进到完整成书。";
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
