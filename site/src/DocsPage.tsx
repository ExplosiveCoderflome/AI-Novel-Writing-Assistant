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
          <p>给使用者、潜在用户和感兴趣读者看的项目文档。</p>
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
        <p className="eyebrow">Public documentation</p>
        <h1>了解项目、开始使用、查看路线图</h1>
        <p>这里展示基础介绍、进阶介绍、使用方法、公开开发计划和更新日志。</p>
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
