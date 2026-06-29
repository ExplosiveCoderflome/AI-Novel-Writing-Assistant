import { ListTree } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type DocHeading = {
  id: string;
  depth: 2 | 3;
  text: string;
};

export function createSlugger() {
  const counts = new Map<string, number>();

  return (text: string) => {
    const base =
      text
        .toLowerCase()
        .trim()
        .replace(/[`*_~()[\]{}<>]/g, "")
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-") || "section";
    const nextCount = counts.get(base) ?? 0;
    counts.set(base, nextCount + 1);
    return nextCount === 0 ? base : `${base}-${nextCount + 1}`;
  };
}

export function parseMarkdownHeadings(markdown: string): DocHeading[] {
  const slug = createSlugger();

  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
      if (!match) {
        return null;
      }
      const text = match[2].replace(/#+$/, "").trim();
      return {
        id: slug(text),
        depth: match[1].length as 2 | 3,
        text,
      };
    })
    .filter((heading): heading is DocHeading => Boolean(heading));
}

function useActiveHeading(headingIds: string[]) {
  const [activeId, setActiveId] = useState<string | undefined>(headingIds[0]);

  useEffect(() => {
    if (headingIds.length === 0) {
      return undefined;
    }

    const headings = headingIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (headings.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) {
          setActiveId(visible.target.id);
        }
      },
      {
        rootMargin: "-92px 0px -68% 0px",
        threshold: [0, 1],
      },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [headingIds]);

  return activeId;
}

type DocsTocProps = {
  headings: DocHeading[];
};

export function DocsToc({ headings }: DocsTocProps) {
  const headingIds = useMemo(() => headings.map((heading) => heading.id), [headings]);
  const activeId = useActiveHeading(headingIds);

  if (headings.length === 0) {
    return null;
  }

  return (
    <aside className="docs-toc" aria-label="本文目录">
      <div className="docs-toc-heading">
        <ListTree size={16} />
        <span>本文目录</span>
      </div>
      <nav>
        {headings.map((heading) => (
          <a
            className={`${heading.depth === 3 ? "nested" : ""} ${
              activeId === heading.id ? "active" : ""
            }`.trim()}
            href={`#${heading.id}`}
            key={heading.id}
          >
            {heading.text}
          </a>
        ))}
      </nav>
    </aside>
  );
}
