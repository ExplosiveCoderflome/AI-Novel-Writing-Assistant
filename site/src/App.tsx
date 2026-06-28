import {
  ArrowRight,
  BookOpenText,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Download,
  GitBranch,
  Github,
  Layers3,
  PenLine,
  Route,
  Sparkles,
  Wand2,
} from "lucide-react";
import chapterExecutionImage from "./assets/chapter-execution.png";
import creativeHubImage from "./assets/creative-hub.png";
import directorChoiceImage from "./assets/director-choice.png";

const repoUrl = "https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant";
const releaseUrl = `${repoUrl}/releases/latest`;

const workflowSteps = [
  {
    title: "自动导演开书",
    text: "从一句灵感整理题材、卖点、方向候选和书名组，先把整本书的方向定稳。",
    icon: Sparkles,
  },
  {
    title: "世界与角色准备",
    text: "把世界规则、势力边界、角色关系和身份锚点沉淀成后续章节可继承的资产。",
    icon: Layers3,
  },
  {
    title: "卷级规划与拆章",
    text: "把长篇拆成卷战略、节奏段、章节目标和任务单，让每一步都有清晰下一步。",
    icon: Route,
  },
  {
    title: "章节执行与质量修复",
    text: "围绕单章写作、审计、修复和状态回灌推进整本生产，减少写到一半散掉的风险。",
    icon: PenLine,
  },
];

const featureGroups = [
  {
    title: "AI Native 创作中枢",
    text: "Creative Hub 承载对话、规划、工具执行和任务状态，让 AI 不只是回复文本，而是参与推进工作流。",
    icon: BrainCircuit,
  },
  {
    title: "长篇生产主链",
    text: "从开书、世界、角色、卷规划到章节生产串成连续流程，面向完成一整本书设计。",
    icon: GitBranch,
  },
  {
    title: "RAG 与知识回灌",
    text: "拆书、知识库、角色和章节状态可以进入上下文检索，后续生成更容易保持同一本书的一致性。",
    icon: Boxes,
  },
  {
    title: "写法引擎",
    text: "写法不只是提示词，而是可保存、试写、绑定和复用的长期资产，支持风格持续继承。",
    icon: Wand2,
  },
];

const screenshots = [
  {
    title: "Creative Hub",
    text: "统一承载创作对话、任务执行和 AI 工作流状态。",
    image: creativeHubImage,
  },
  {
    title: "自动导演方向选择",
    text: "从多个整本方案中选择方向，再继续推进到可开写状态。",
    image: directorChoiceImage,
  },
  {
    title: "章节执行",
    text: "把任务单、正文写作、审核修复和状态同步放在同一个工作台。",
    image: chapterExecutionImage,
  },
];

const audience = [
  "想用 AI 完成长篇小说，而不是只生成片段文案的创作者。",
  "正在研究 Agent Workflow、LangGraph 编排和 AI Native 产品落地的开发者。",
  "希望把世界观、角色、知识库、写法控制和章节生产串成一条链的团队。",
];

function App() {
  return (
    <main>
      <nav className="site-nav" aria-label="主导航">
        <a className="brand" href="#top" aria-label="AI 小说创作工作台首页">
          <span className="brand-mark">
            <BookOpenText size={20} strokeWidth={2.2} />
          </span>
          <span>AI 小说创作工作台</span>
        </a>
        <div className="nav-links">
          <a href="#workflow">工作流</a>
          <a href="#features">能力</a>
          <a href="#screenshots">截图</a>
          <a href={repoUrl}>GitHub</a>
        </div>
      </nav>

      <section id="top" className="hero" aria-label="项目介绍">
        <div className="hero-backdrop" />
        <div className="hero-content">
          <p className="eyebrow">AI Native long-form novel production workspace</p>
          <h1>AI 小说创作工作台</h1>
          <p className="hero-copy">
            从一句灵感出发，把自动导演、世界观、角色、知识库、写法引擎和章节执行串成一条面向整本小说完成的生产链。
          </p>
          <div className="hero-actions">
            <a className="button primary" href={releaseUrl}>
              <Download size={18} />
              下载桌面版
            </a>
            <a className="button secondary" href={repoUrl}>
              <Github size={18} />
              查看源码
            </a>
          </div>
        </div>
      </section>

      <section id="workflow" className="section section-light">
        <div className="section-heading">
          <p className="eyebrow">Production flow</p>
          <h2>把长篇创作拆成能连续推进的步骤</h2>
          <p>
            这个项目优先服务完全不懂写作结构的新手：系统会给出清晰默认路径，帮助用户从开书一路推进到章节生产。
          </p>
        </div>
        <div className="workflow-grid">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article className="workflow-card" key={step.title}>
                <div className="card-topline">
                  <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                  <Icon size={22} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="features" className="section section-tint">
        <div className="section-heading compact">
          <p className="eyebrow">Core capabilities</p>
          <h2>不只是写一句回一句，而是组织一条真实创作链</h2>
        </div>
        <div className="feature-grid">
          {featureGroups.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature-card" key={feature.title}>
                <Icon size={24} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="screenshots" className="section section-light">
        <div className="section-heading">
          <p className="eyebrow">Product preview</p>
          <h2>真实界面展示当前工作台形态</h2>
          <p>站点使用仓库现有截图，方便访问者快速理解项目已经覆盖的主要生产环节。</p>
        </div>
        <div className="screenshot-grid">
          {screenshots.map((item) => (
            <article className="screenshot-card" key={item.title}>
              <img src={item.image} alt={`${item.title}界面截图`} loading="lazy" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section split-section">
        <div>
          <p className="eyebrow">Who it is for</p>
          <h2>适合关注长篇完成率的人</h2>
          <div className="check-list">
            {audience.map((item) => (
              <p key={item}>
                <CheckCircle2 size={19} />
                <span>{item}</span>
              </p>
            ))}
          </div>
        </div>
        <aside className="tech-panel" aria-label="技术栈">
          <h3>技术栈</h3>
          <p>React + Vite 前端，Express + Prisma 服务端，SQLite 默认本地运行，RAG 可接入 Qdrant。</p>
          <a href={repoUrl}>
            打开 GitHub 仓库
            <ArrowRight size={17} />
          </a>
        </aside>
      </section>

      <section className="cta-section">
        <div>
          <p className="eyebrow">Start building</p>
          <h2>下载桌面版，或者直接从源码启动</h2>
        </div>
        <div className="cta-actions">
          <a className="button primary" href={releaseUrl}>
            <Download size={18} />
            获取最新版本
          </a>
          <a className="button secondary" href={repoUrl}>
            <Github size={18} />
            参与开发
          </a>
        </div>
      </section>
    </main>
  );
}

export default App;
