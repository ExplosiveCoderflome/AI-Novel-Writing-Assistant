import { ArrowLeft, ArrowRight, FileText, Search } from "lucide-react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { getDocContent } from "./docsContent";
import { docsManifest, flattenedDocs } from "./docsManifest";

const repoUrl = "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant";

type DocsPageProps = {
  docId?: string;
};

export default function DocsPage({ docId }: DocsPageProps) {
  const activeDoc = flattenedDocs.find((doc) => doc.id === docId);
  const markdown = activeDoc ? getDocContent(activeDoc.sourcePath) : undefined;

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
          <p>从现有 docs 中筛选公开适合阅读的长期知识。</p>
        </div>
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
          <article className="markdown-doc">
            <div className="doc-meta">
              <p className="eyebrow">{activeDoc.categoryTitle}</p>
              <a href={`${repoUrl}/blob/main/${activeDoc.sourcePath.replace("../../", "")}`}>
                GitHub 原文
                <ArrowRight size={15} />
              </a>
            </div>
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </article>
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
        <p className="eyebrow">Curated documentation</p>
        <h1>阅读产品原则、工作流和架构边界</h1>
        <p>
          这里不会直接暴露整个 `docs/`。页面只展示适合公开阅读、能帮助理解项目长期维护方式的文档。
        </p>
        <div className="docs-stats">
          <p>
            <FileText size={18} />
            {totalDocs} 篇精选文档
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
              <p className="eyebrow">{category.title}</p>
              <h2>{category.description}</h2>
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
