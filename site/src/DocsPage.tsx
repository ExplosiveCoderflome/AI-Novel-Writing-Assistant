import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, FileText, Search } from "lucide-react";
import { Children, cloneElement, isValidElement, useMemo } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Breadcrumb } from "./components/Breadcrumb";
import { DocsSearch } from "./components/DocsSearch";
import { DocsToc, parseMarkdownHeadings, slugify } from "./components/DocsToc";
import { resolveDocAssetUrl } from "./docsAssets";
import { getDocContent } from "./docsContent";
import { docsManifest, flattenedDocs } from "./docsManifest";
import { usePageMeta } from "./hooks/usePageMeta";

const repoUrl = "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant";

type DocsPageProps = {
  docId?: string;
};

function extractText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return extractText(child.props.children);
      }
      return "";
    })
    .join("");
}

function rewriteMarkdownImageUrls(markdown: string, docSourcePath: string): string {
  return markdown.replace(/(!\[[^\]]*\]\()([^)\s]+)(\))/g, (full, open, src, close) => {
    const resolved = resolveDocAssetUrl(docSourcePath, src);
    return `${open}${resolved ?? src}${close}`;
  });
}

function preprocessMarkdownDirectives(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let directive: { type: "tip" | "warn" | "checkpoint"; title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const open = /^:::(tip|warn|checkpoint)\s*(.*)$/.exec(line.trim());
    if (open && !directive) {
      directive = {
        type: open[1] as "tip" | "warn" | "checkpoint",
        title: open[2].trim(),
        lines: [],
      };
      continue;
    }
    if (directive && line.trim() === ":::") {
      output.push(`> [!${directive.type.toUpperCase()}]${directive.title ? ` ${directive.title}` : ""}`);
      output.push(">");
      output.push(...directive.lines.map((item) => `> ${item}`));
      directive = null;
      continue;
    }
    if (directive) {
      directive.lines.push(line);
      continue;
    }
    output.push(line);
  }

  if (directive) {
    output.push(`> [!${directive.type.toUpperCase()}]${directive.title ? ` ${directive.title}` : ""}`);
    output.push(">");
    output.push(...directive.lines.map((item) => `> ${item}`));
  }

  return output.join("\n").replace(/<!--[\s\S]*?-->/g, "");
}

function normalizeCalloutType(value: string): "tip" | "warn" | "checkpoint" | null {
  const normalized = value.toLowerCase();
  if (normalized === "tip" || normalized === "warn" || normalized === "checkpoint") {
    return normalized;
  }
  return null;
}

function stripCalloutMarker(children: ReactNode): {
  type: "tip" | "warn" | "checkpoint" | null;
  children: ReactNode;
} {
  const childArray = Children.toArray(children);
  const first = childArray[0];
  if (!isValidElement<{ children?: ReactNode }>(first)) {
    return { type: null, children };
  }
  const text = extractText(first.props.children);
  const match = /^\s*\[!(TIP|WARN|CHECKPOINT)\]\s*(.*)$/i.exec(text);
  if (!match) {
    return { type: null, children };
  }
  const type = normalizeCalloutType(match[1]);
  if (!type) {
    return { type: null, children };
  }
  const replacement = match[2]?.trim() || (
    type === "checkpoint" ? "Checkpoint" : type === "warn" ? "注意" : "提示"
  );
  return {
    type,
    children: [
      cloneElement(first, { ...first.props, children: replacement }),
      ...childArray.slice(1),
    ],
  };
}

function createMarkdownComponents(docSourcePath: string): Components {
  function Heading2({ children, ...props }: ComponentPropsWithoutRef<"h2">) {
    return (
      <h2 id={slugify(extractText(children))} {...props}>
        {children}
      </h2>
    );
  }

  function Heading3({ children, ...props }: ComponentPropsWithoutRef<"h3">) {
    return (
      <h3 id={slugify(extractText(children))} {...props}>
        {children}
      </h3>
    );
  }

  function Image({ src, alt, ...props }: ComponentPropsWithoutRef<"img">) {
    return <img src={resolveDocAssetUrl(docSourcePath, src)} alt={alt ?? ""} {...props} />;
  }

  function Blockquote({ children, ...props }: ComponentPropsWithoutRef<"blockquote">) {
    const callout = stripCalloutMarker(children);
    if (callout.type) {
      return (
        <aside className={`callout ${callout.type}`}>
          {callout.children}
        </aside>
      );
    }
    return <blockquote {...props}>{children}</blockquote>;
  }

  return {
    blockquote: Blockquote,
    h2: Heading2,
    h3: Heading3,
    img: Image,
  };
}

export default function DocsPage({ docId }: DocsPageProps) {
  const activeIndex = flattenedDocs.findIndex((doc) => doc.id === docId);
  const activeDoc = activeIndex >= 0 ? flattenedDocs[activeIndex] : undefined;
  const rawMarkdown = activeDoc ? getDocContent(activeDoc.sourcePath) : undefined;
  const markdown = useMemo(() => {
    if (!rawMarkdown || !activeDoc) {
      return undefined;
    }
    const withUrls = rewriteMarkdownImageUrls(rawMarkdown, activeDoc.sourcePath);
    return preprocessMarkdownDirectives(withUrls);
  }, [rawMarkdown, activeDoc]);
  const previousDoc = activeIndex > 0 ? flattenedDocs[activeIndex - 1] : undefined;
  const nextDoc = activeIndex >= 0 ? flattenedDocs[activeIndex + 1] : undefined;
  usePageMeta(
    activeDoc
      ? {
          title: `${activeDoc.title} · ${activeDoc.categoryTitle}`,
          description: activeDoc.description,
          canonicalPath: `#/docs/${activeDoc.id}`,
        }
      : { title: "项目文档", description: "AI 小说创作工作台公开文档：安装、使用方法、自动导演阶段全景、章节执行链、按阶段恢复手册和模块说明。", canonicalPath: "#/docs" },
  );
  const headings = useMemo(() => (markdown ? parseMarkdownHeadings(markdown) : []), [markdown]);
  const markdownComponents = useMemo(
    () => (activeDoc && markdown ? createMarkdownComponents(activeDoc.sourcePath) : {}),
    [activeDoc, markdown],
  );

  return (
    <section className="docs-shell">
      <aside className="docs-sidebar" aria-label="文档目录">
        <a className="docs-back" href="#/">
          <ArrowLeft size={16} />
          返回首页
        </a>
        <div className="docs-sidebar-heading">
          <p className="eyebrow">Docs</p>
          <h1>项目文档</h1>
          <p>从安装、开书、知识资产到系统配置，按创作路径查找需要的说明。</p>
        </div>
        <DocsSearch />
        <nav>
          {docsManifest.map((category) => (
            <div className="docs-nav-group" key={category.id}>
              <p>{category.title}</p>
              {category.docs.map((doc) => (
                <a
                  className={activeDoc?.id === doc.id ? "active" : ""}
                  href={`#/docs/${doc.id}`}
                  key={doc.id}
                >
                  {doc.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="docs-main">
        {activeDoc && markdown ? (
          <div className="docs-document-layout">
            <article className="markdown-doc">
              <div className="doc-meta">
                <Breadcrumb categoryTitle={activeDoc.categoryTitle} docTitle={activeDoc.title} />
                <a href={`${repoUrl}/blob/main/${activeDoc.githubPath}`}>
                  GitHub 原文
                  <ArrowRight size={15} />
                </a>
              </div>
              <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                {markdown}
              </ReactMarkdown>
              <nav className="doc-pagination" aria-label="文档翻页">
                {previousDoc ? (
                  <a href={`#/docs/${previousDoc.id}`}>
                    <ChevronLeft size={18} />
                    <span>
                      上一篇
                      <strong>{previousDoc.title}</strong>
                    </span>
                  </a>
                ) : (
                  <span />
                )}
                {nextDoc ? (
                  <a href={`#/docs/${nextDoc.id}`}>
                    <span>
                      下一篇
                      <strong>{nextDoc.title}</strong>
                    </span>
                    <ChevronRight size={18} />
                  </a>
                ) : (
                  <span />
                )}
              </nav>
            </article>
            <DocsToc headings={headings} />
          </div>
        ) : (
          <DocsIndex />
        )}
      </div>
    </section>
  );
}

function DocsIndex() {
  const totalDocs = useMemo(() => flattenedDocs.length, []);

  return (
    <div className="docs-index">
      <div className="docs-hero">
        <p className="eyebrow">Public documentation</p>
        <h1>按创作路径查找文档</h1>
        <p>这里展示安装、使用方法、侧栏功能模块、公开开发计划和更新日志。</p>
        <div className="docs-stats">
          <p>
            <FileText size={18} />
            {totalDocs} 篇公开文档
          </p>
          <p>
            <Search size={18} />
            {docsManifest.length} 个主题
          </p>
        </div>
      </div>
      <div className="docs-category-grid">
        {docsManifest.map((category) => (
          <section className="docs-category" key={category.id}>
            <div>
              <h2>{category.title}</h2>
              <p>{category.description}</p>
            </div>
            <div className="docs-card-list">
              {category.docs.map((doc) => (
                <a className="docs-card" href={`#/docs/${doc.id}`} key={doc.id}>
                  <h3>{doc.title}</h3>
                  <p>{doc.description}</p>
                  <span>
                    阅读文档
                    <ArrowRight size={15} />
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
