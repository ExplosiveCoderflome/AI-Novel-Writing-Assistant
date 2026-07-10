import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDocContent } from "../docsContent";
import { flattenedDocs } from "../docsManifest";
import { docsPath } from "../routing";

type SearchResult = {
  id: string;
  title: string;
  categoryTitle: string;
  description: string;
  excerpt: string;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function createExcerpt(content: string, query: string) {
  const flatContent = content.replace(/[#>*`_\-[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const lowerContent = flatContent.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);
  if (index < 0) {
    return flatContent.slice(0, 96);
  }
  const start = Math.max(index - 36, 0);
  const end = Math.min(index + lowerQuery.length + 68, flatContent.length);
  return `${start > 0 ? "..." : ""}${flatContent.slice(start, end)}${end < flatContent.length ? "..." : ""}`;
}

export function DocsSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const searchIndex = useMemo(
    () =>
      flattenedDocs.map((doc) => {
        const content = getDocContent(doc.sourcePath) ?? "";
        return {
          ...doc,
          content,
          searchable: normalizeText(`${doc.title} ${doc.description} ${doc.categoryTitle} ${content}`),
        };
      }),
    [],
  );

  const results = useMemo<SearchResult[]>(() => {
    const normalizedQuery = normalizeText(query);
    if (normalizedQuery.length < 2) {
      return [];
    }

    return searchIndex
      .filter((doc) => doc.searchable.includes(normalizedQuery))
      .slice(0, 8)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        categoryTitle: doc.categoryTitle,
        description: doc.description,
        excerpt: createExcerpt(doc.content || doc.description, normalizedQuery),
      }));
  }, [query, searchIndex]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="docs-search">
      <label htmlFor="docs-search-input">搜索公开文档</label>
      <div className="docs-search-box">
        <Search size={16} />
        <input
          id="docs-search-input"
          ref={inputRef}
          type="search"
          placeholder="搜索功能、问题或配置"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}>
            <X size={15} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>

      {query.length >= 2 ? (
        <div className="docs-search-results">
          {results.length > 0 ? (
            results.map((result) => (
              <a href={docsPath(result.id)} key={result.id}>
                <span>{result.categoryTitle}</span>
                <strong>{result.title}</strong>
                <p>{result.excerpt || result.description}</p>
              </a>
            ))
          ) : (
            <p>没有找到匹配文档。</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
