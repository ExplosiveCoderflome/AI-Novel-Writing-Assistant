import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, FileText, Search } from "lucide-react";
import { Children, isValidElement, useMemo } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Breadcrumb } from "./components/Breadcrumb";
import { DocsSearch } from "./components/DocsSearch";
import { createSlugger, DocsToc, parseMarkdownHeadings } from "./components/DocsToc";
import { getDocContent } from "./docsContent";
import { docsManifest, flattenedDocs } from "./docsManifest";

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

function createMarkdownComponents(markdown: string): Components {
  const slug = createSlugger();

  function Heading2({ children, ...props }: ComponentPropsWithoutRef<"h2">) {
    return (
      <h2 id={slug(extractText(children))} {...props}>
        {children}
      </h2>
    );
  }

  function Heading3({ children, ...props }: ComponentPropsWithoutRef<"h3">) {
    return (
      <h3 id={slug(extractText(children))} {...props}>
        {children}
      </h3>
    );
  }

  void markdown;
  return {
    h2: Heading2,
    h3: Heading3,
  };
}

export default function DocsPage({ docId }: DocsPageProps) {
  const activeIndex = flattenedDocs.findIndex((doc) => doc.id === docId);
  const activeDoc = activeIndex >= 0 ? flattenedDocs[activeIndex] : undefined;
  const markdown = activeDoc ? getDocContent(activeDoc.sourcePath) : undefined;
  const previousDoc = activeIndex > 0 ? flattenedDocs[activeIndex - 1] : undefined;
  const nextDoc = activeIndex >= 0 ? flattenedDocs[activeIndex + 1] : undefined;
  const headings = useMemo(() => (markdown ? parseMarkdownHeadings(markdown) : []), [markdown]);
  const markdownComponents = useMemo(
    () => (markdown ? createMarkdownComponents(markdown) : {}),
    [markdown],
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
              <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
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
