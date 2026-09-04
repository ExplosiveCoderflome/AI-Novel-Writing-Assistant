import {
  ArrowRight,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Download,
  FileText,
  Github,
  PenLine,
  Sparkles,
  Star,
} from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import appIcon from "./assets/app-icon.png";
import { formatStarCount, useGithubStars } from "./hooks/useGithubStars";
import { usePageMeta } from "./hooks/usePageMeta";
import DocsPage from "./DocsPage";
import { docsPath, isSitePath, parseRoute, sitePath } from "./routing";
import bookAnalysisImage from "../../images/v2/微信截图_20260813220038.png";
import bookshelfImage from "../../images/v2/微信截图_20260813220328.png";
import chapterExecutionImage from "../../images/write/章节执行.png";
import projectSettingsImage from "../../images/write/项目设定.png";

const repoUrl = "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant";
const releaseUrl = `${repoUrl}/releases/latest`;
const docsIntroBannerImage = `${import.meta.env.BASE_URL}assets/docs-intro-banner.png`;

const proofItems = [
  "灵感、市场、参考书三种起点",
  "AI 自动准备到可以开始写",
  "简易 / 专业两种创作方式",
  "从已保存进度安全恢复",
];

const productionFlow = [
  {
    marker: "01",
    title: "选择最适合你的开书起点",
    text: "输入一句灵感，从热门题材雷达选择公开榜单信号，或从完成的拆书选择续写原作、参考创作新书。三个入口都会进入同一条自动导演主链。",
    image: bookAnalysisImage,
  },
  {
    marker: "02",
    title: "让 AI 先准备到可以开始写",
    text: "自动导演会依次完成书级定位、故事宏观、世界与角色、卷战略、节奏拆章和章节任务。只有方案选择或真实异常需要你处理时，流程才会停下来说明原因。",
    image: projectSettingsImage,
  },
  {
    marker: "03",
    title: "选择自动推进，或随时接管",
    text: "简易创作持续生成、审核和修复整本正文；专业创作提供完整工作台。两种方式共用同一套章节状态，切换不会清空规划、正文或恢复位置。",
    image: bookshelfImage,
  },
];

const consoleModules = [
  {
    title: "开书定盘",
    text: "灵感、市场信号和参考拆书都会先整理成书级定位、核心卖点与前期承诺。",
    icon: BrainCircuit,
  },
  {
    title: "AI 驾驶舱",
    text: "自动导演持续准备世界、角色和卷章任务，只有需要选择方案或处理异常时才请求介入。",
    icon: Sparkles,
  },
  {
    title: "简易 / 专业创作",
    text: "想自动完成整本书就进入简易创作，需要细看和调整时切换到专业工作台。",
    icon: Boxes,
  },
  {
    title: "问题处理与恢复",
    text: "运行记录保留真实错误和恢复位置；局部质量问题进入待优化，不会无故停止整本创作。",
    icon: PenLine,
  },
];

const audience = [
  "第一次写长篇，希望 AI 给出明确下一步并自动准备结构的创作者。",
  "想从市场趋势或参考作品出发，又希望新书保持独立设定的使用者。",
  "需要在自动推进与人工接管之间切换，并保留正文和恢复位置的创作者。",
  "正在研究 Agent Workflow、LangGraph 编排和 AI Native 产品落地的开发者。",
];

const routeChangeEvent = "ai-novel-site:navigation";

function subscribePath(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(routeChangeEvent, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(routeChangeEvent, callback);
  };
}

function getPathSnapshot() {
  return window.location.pathname;
}

function usePathRoute(initialPath = "/") {
  return useSyncExternalStore(subscribePath, getPathSnapshot, () => initialPath);
}

function useHistoryNavigation() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      const target = event.target as Element | null;
      const link = target?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download")) {
        return;
      }
      const url = new URL(link.href);
      if (url.origin !== window.location.origin || !isSitePath(url.pathname)) {
        return;
      }
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextPath = `${url.pathname}${url.search}${url.hash}`;
      if (nextPath === currentPath) {
        return;
      }
      if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      event.preventDefault();
      window.history.pushState(null, "", nextPath);
      window.dispatchEvent(new Event(routeChangeEvent));
      window.scrollTo({ top: 0, behavior: "instant" });
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);
}

type AppProps = {
  initialPath?: string;
};

function App({ initialPath }: AppProps) {
  useHistoryNavigation();
  const pathname = usePathRoute(initialPath);
  const route = parseRoute(pathname);

  return (
    <main>
      <SiteNav page={route.page} />
      {route.page === "docs" ? (
        <DocsPage docId={route.docId} />
      ) : (
        <HomePage />
      )}
    </main>
  );
}

function SiteNav({ page }: { page: "home" | "docs" }) {
  const stars = useGithubStars("ExplosiveCoderflome", "AI-Novel-Writing-Assistant");
  return (
    <nav className="site-nav" aria-label="主导航">
      <a className="brand" href={sitePath("/")} aria-label="AI 小说创作工作台首页">
        <span className="brand-mark">
          <img src={appIcon} alt="" aria-hidden="true" />
        </span>
        <span>AI 小说创作工作台</span>
      </a>
      <div className="nav-links">
        <a href={docsPath()}>文档</a>
        {page === "home" ? (
          <>
            <a href="#flow">生产链</a>
            <a href="#console">控制台</a>
            <a href="#audience">适合谁</a>
          </>
        ) : (
          <a href={releaseUrl}>下载桌面版</a>
        )}
        <a className="nav-github" href={repoUrl} aria-label={stars !== null ? `GitHub · ${stars} stars` : "GitHub"}>
          <Github size={15} />
          <span>GitHub</span>
          {stars !== null ? (
            <span className="nav-stars">
              <Star size={11} strokeWidth={2.4} />
              {formatStarCount(stars)}
            </span>
          ) : null}
        </a>
      </div>
    </nav>
  );
}

function HomePage() {
  const stars = useGithubStars("ExplosiveCoderflome", "AI-Novel-Writing-Assistant");
  usePageMeta(null);
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
          <p className="eyebrow">AI 驱动的长篇小说生产工作台</p>
          <h1>从灵感、趋势或参考作品，到一整本小说</h1>
          <p className="hero-copy">
            你只需要先选开书依据。AI 会准备书级定位、世界、角色和卷章任务；到达可开写状态后，可以让简易创作持续推进，也可以进入专业工作台随时接管。
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
            <a className="button ghost" href={docsPath()}>
              <FileText size={18} />
              阅读文档
            </a>
            {stars !== null ? (
              <a
                className="button star"
                href={`${repoUrl}/stargazers`}
                aria-label={`GitHub ${stars} 颗 star`}
              >
                <Star size={18} strokeWidth={2.2} />
                <span>给个 Star</span>
                <span className="star-count">{formatStarCount(stars)}</span>
              </a>
            ) : null}
          </div>
          <div className="route-strip" aria-label="核心生产路径">
            <span>灵感 / 市场 / 参考书</span>
            <ArrowRight size={15} />
            <span>书级方案</span>
            <ArrowRight size={15} />
            <span>世界 / 角色 / 卷章</span>
            <ArrowRight size={15} />
            <span>简易 / 专业创作</span>
            <ArrowRight size={15} />
            <span>审核 / 修复 / 恢复</span>
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
          <h2>先选开书依据，再让 AI 把整本书推到可持续创作</h2>
          <p>
            新手只处理真正影响方向的选择；结构准备、章节生产、问题记录和安全恢复由同一条工作流承接。
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
          <h2>一本书的进度、任务和恢复入口，都在同一套工作流里</h2>
          <p>
            首页告诉你下一步，书架承接持续创作，完整工作台负责检查和调整；运行记录与导演跟进保留真实错误、暂停原因和恢复位置。
          </p>
        </div>
        <div className="console-layout">
          <div className="console-wall" aria-label="产品界面预览">
            <img className="console-main" src={projectSettingsImage} alt="自动导演准备书级定位并持续执行章节" />
            <img className="console-float one" src={bookshelfImage} alt="小说书架与简易专业创作入口" />
            <img className="console-float two" src={chapterExecutionImage} alt="章节正文、审核和修复工作台" />
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
          <h3>先连接一个文本模型，跑通第一本测试小说</h3>
          <p>
            桌面版默认使用 SQLite 保存本地作品。第一次使用只需完成文本模型连接；需要知识库检索时再配置 Qdrant。
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
          <h2>按第一次开书、理解机制或任务恢复进入文档</h2>
          <p>文档按实操路径、生产链深度和阶段恢复组织，并提供 Vibe Coding 项目排查修复 Skill。</p>
        </div>
        <a className="button primary" href={docsPath()}>
          <FileText size={18} />
          打开文档
        </a>
      </section>

      <section className="cta-section">
        <p className="eyebrow">Open source</p>
        <h2>让 AI 不只写一章，而是陪你把整本书推进到完成。</h2>
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
