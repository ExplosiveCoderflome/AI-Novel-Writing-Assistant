import {
  ArrowRight,
  BookOpenText,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Download,
  FileText,
  Github,
  PenLine,
  Sparkles,
} from "lucide-react";
import { lazy, Suspense, useSyncExternalStore } from "react";
import chapterExecutionImage from "./assets/chapter-execution.png";
import creativeHubImage from "./assets/creative-hub.png";
import directorChoiceImage from "./assets/director-choice.png";

const DocsPage = lazy(() => import("./DocsPage"));

const repoUrl = "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant";
const releaseUrl = `${repoUrl}/releases/latest`;
const docsIntroBannerImage = `${import.meta.env.BASE_URL}assets/docs-intro-banner.png`;

const proofItems = [
  "自动导演开书",
  "本书世界与角色资产",
  "RAG 知识回灌",
  "章节执行与质量修复",
];

const productionFlow = [
  {
    marker: "01",
    title: "把灵感定成可写方向",
    text: "从一句模糊想法开始，AI 先整理题材、卖点、读者感受和整本方向候选，让新手不用先凭空搭完世界和大纲。",
    image: directorChoiceImage,
  },
  {
    marker: "02",
    title: "准备世界、角色和长期承诺",
    text: "系统把舞台规则、势力边界、角色关系和前期承诺沉淀为可继承资产，让后续章节减少对临时提示词的依赖。",
    image: creativeHubImage,
  },
  {
    marker: "03",
    title: "拆成卷、节奏段和章节任务",
    text: "长篇会被拆成卷战略、节奏板、章节目标和执行任务单，每一步都能继续推进、回看和调整。",
    image: chapterExecutionImage,
  },
];

const consoleModules = [
  {
    title: "Creative Hub",
    text: "对话、追问、规划、工具调用和任务状态集中在同一个创作中枢。",
    icon: BrainCircuit,
  },
  {
    title: "自动导演",
    text: "从开书方向到章节批次准备，持续给出下一步建议和可恢复节点。",
    icon: Sparkles,
  },
  {
    title: "知识与写法",
    text: "拆书、知识库、写法资产进入上下文检索，让后续章节继承同一套创作依据。",
    icon: Boxes,
  },
  {
    title: "章节生产",
    text: "正文写作、审核、修复和状态回灌串成单章执行链。",
    icon: PenLine,
  },
];

const audience = [
  "想用 AI 完成长篇小说，而不是只生成片段文案的创作者。",
  "希望系统给出清晰默认步骤、降低写作结构门槛的新手。",
  "正在研究 Agent Workflow、LangGraph 编排和 AI Native 产品落地的开发者。",
];

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getHashSnapshot() {
  return window.location.hash || "#/";
}

function useHashRoute() {
  return useSyncExternalStore(subscribeHash, getHashSnapshot, () => "#/");
}

function App() {
  const hash = useHashRoute();
  const route = parseRoute(hash);

  return (
    <main>
      <SiteNav page={route.page} />
      {route.page === "docs" ? (
        <Suspense fallback={<div className="docs-loading">正在打开文档...</div>}>
          <DocsPage docId={route.docId} />
        </Suspense>
      ) : (
        <HomePage />
      )}
    </main>
  );
}

function parseRoute(hash: string): { page: "home" } | { page: "docs"; docId?: string } {
  const cleanHash = hash.replace(/^#/, "");
  if (cleanHash === "/docs" || cleanHash === "/docs/") {
    return { page: "docs" };
  }
  if (cleanHash.startsWith("/docs/")) {
    return { page: "docs", docId: decodeURIComponent(cleanHash.replace("/docs/", "")) };
  }
  return { page: "home" };
}

function SiteNav({ page }: { page: "home" | "docs" }) {
  return (
    <nav className="site-nav" aria-label="主导航">
      <a className="brand" href="#/" aria-label="AI 小说创作工作台首页">
        <span className="brand-mark">
          <BookOpenText size={20} strokeWidth={2.1} />
        </span>
        <span>AI 小说创作工作台</span>
      </a>
      <div className="nav-links">
        <a href="#/docs">文档</a>
        {page === "home" ? (
          <>
            <a href="#flow">生产链</a>
            <a href="#console">控制台</a>
            <a href="#audience">适合谁</a>
          </>
        ) : (
          <a href={releaseUrl}>下载桌面版</a>
        )}
        <a href={repoUrl}>GitHub</a>
      </div>
    </nav>
  );
}

function HomePage() {
  return (
    <>
      <section
        id="top"
        className="hero"
        style={{ backgroundImage: `url(${docsIntroBannerImage})` }}
        aria-label="项目介绍"
      >
        <div className="hero-scrim" />
        <div className="hero-content">
          <p className="eyebrow">AI native novel production workspace</p>
          <h1>从一句灵感，到一整本小说</h1>
          <p className="hero-copy">
            自动导演、世界观、角色、拆章、章节执行和质量修复串成一条长篇生产链，帮助新手把想法推进到可持续写作。
          </p>
          <div className="hero-actions">
            <a className="button primary" href={releaseUrl}>
              <Download size={18} />
              下载桌面版
            </a>
            <a className="button ghost" href={repoUrl}>
              <Github size={18} />
              查看 GitHub
            </a>
            <a className="button ghost" href="#/docs">
              <FileText size={18} />
              阅读文档
            </a>
          </div>
          <div className="route-strip" aria-label="核心生产路径">
            <span>灵感</span>
            <ArrowRight size={15} />
            <span>方向</span>
            <ArrowRight size={15} />
            <span>世界 / 角色</span>
            <ArrowRight size={15} />
            <span>拆章</span>
            <ArrowRight size={15} />
            <span>正文</span>
            <ArrowRight size={15} />
            <span>修复</span>
          </div>
        </div>
      </section>

      <section className="proof-band" aria-label="项目能力概览">
        {proofItems.map((item) => (
          <p key={item}>
            <CheckCircle2 size={17} />
            <span>{item}</span>
          </p>
        ))}
      </section>

      <section id="flow" className="section editorial-flow">
        <div className="section-kicker">
          <p className="eyebrow">Production flow</p>
          <h2>让 AI 先组织整本书，再进入正文生产</h2>
          <p>
            页面不把功能散成按钮清单，而是展示创作者真正会走过的主链：先定方向，再准备资产，最后进入章节执行。
          </p>
        </div>
        <div className="flow-list">
          {productionFlow.map((step) => (
            <article className="flow-row" key={step.marker}>
              <div className="flow-copy">
                <span>{step.marker}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
              <figure className="flow-image">
                <img src={step.image} alt={`${step.title}界面截图`} loading="lazy" />
              </figure>
            </article>
          ))}
        </div>
      </section>

      <section id="console" className="console-section">
        <div className="console-heading">
          <p className="eyebrow">Product console</p>
          <h2>文学创作的温度，配上真实工作流的控制台</h2>
          <p>
            这个项目不是普通聊天壳子。它把上下文、任务状态、模型路由和章节链路组织在一起，让 AI 更像参与整本生产的系统角色。
          </p>
        </div>
        <div className="console-layout">
          <div className="console-wall" aria-label="产品界面预览">
            <img className="console-main" src={creativeHubImage} alt="Creative Hub 界面截图" />
            <img className="console-float one" src={directorChoiceImage} alt="自动导演方向选择截图" />
            <img className="console-float two" src={chapterExecutionImage} alt="章节执行界面截图" />
          </div>
          <div className="console-modules">
            {consoleModules.map((module) => {
              const Icon = module.icon;
              return (
                <article key={module.title}>
                  <Icon size={21} />
                  <div>
                    <h3>{module.title}</h3>
                    <p>{module.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="audience" className="section audience-section">
        <div className="audience-copy">
          <p className="eyebrow">Who it helps</p>
          <h2>面向长篇完成率，而不是单次灵感回复</h2>
          <div className="audience-list">
            {audience.map((item) => (
              <p key={item}>
                <CheckCircle2 size={19} />
                <span>{item}</span>
              </p>
            ))}
          </div>
        </div>
        <aside className="download-panel">
          <p className="panel-label">Windows desktop</p>
          <h3>先下载桌面版，跑通一条完整创作链</h3>
          <p>
            默认 SQLite 可以本地运行；需要知识库检索时再接入 Qdrant。开发者可以从源码继续研究前后端和 Agent 工作流。
          </p>
          <div className="panel-actions">
            <a className="button primary dark" href={releaseUrl}>
              <Download size={18} />
              最新版本
            </a>
            <a className="text-link" href={repoUrl}>
              打开仓库
              <ArrowRight size={17} />
            </a>
          </div>
        </aside>
      </section>

      <section className="docs-teaser section">
        <div>
          <p className="eyebrow">Documentation</p>
          <h2>查看公开文档与模块说明</h2>
          <p>文档站集中展示项目介绍、使用方法、侧栏功能模块、公开开发计划和更新日志。</p>
        </div>
        <a className="button primary" href="#/docs">
          <FileText size={18} />
          打开文档
        </a>
      </section>

      <section className="cta-section">
        <p className="eyebrow">Open source</p>
        <h2>把长篇小说创作做成可以运行、可以恢复、可以继续改进的生产系统。</h2>
        <div className="cta-actions">
          <a className="button primary" href={releaseUrl}>
            <Download size={18} />
            下载桌面版
          </a>
          <a className="button ghost" href={repoUrl}>
            <Github size={18} />
            查看源码
          </a>
        </div>
      </section>
    </>
  );
}

export default App;
