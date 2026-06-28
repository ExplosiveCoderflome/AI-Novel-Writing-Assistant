export type SiteDocCategory = {
  id: string;
  title: string;
  description: string;
  docs: SiteDocEntry[];
};

export type SiteDocEntry = {
  id: string;
  title: string;
  description: string;
  sourcePath: string;
};

export const docsManifest: SiteDocCategory[] = [
  {
    id: "product",
    title: "产品理念",
    description: "理解项目为什么优先服务新手和整本完成率。",
    docs: [
      {
        id: "beginner-first-novel-completion",
        title: "新手优先与整本小说完成原则",
        description: "产品、UX、Prompt 和 runtime 决策的长期原则。",
        sourcePath: "../../docs/wiki/product/beginner-first-novel-completion.md",
      },
      {
        id: "github-intro-site",
        title: "GitHub Pages 公开介绍站",
        description: "公开介绍站的定位、设计边界和部署职责。",
        sourcePath: "../../docs/wiki/product/github-intro-site.md",
      },
    ],
  },
  {
    id: "workflows",
    title: "核心工作流",
    description: "自动导演、章节生产、拆书与 Creative Hub 的维护边界。",
    docs: [
      {
        id: "auto-director-runtime",
        title: "自动导演 Runtime 与恢复边界",
        description: "自动导演运行、恢复、状态投影和任务衔接规则。",
        sourcePath: "../../docs/wiki/workflows/auto-director-runtime.md",
      },
      {
        id: "chapter-production-chain",
        title: "章节生产链路",
        description: "章节写作、审计、修复、保存和质量债务边界。",
        sourcePath: "../../docs/wiki/workflows/chapter-production-chain.md",
      },
      {
        id: "book-analysis-workflow",
        title: "拆书工作流",
        description: "拆书生成、证据、角色档案和形象演变的运行规则。",
        sourcePath: "../../docs/wiki/workflows/book-analysis-workflow.md",
      },
      {
        id: "creative-hub-boundary",
        title: "Creative Hub 边界",
        description: "创作中枢如何解释进度、推荐下一步和发起受控命令。",
        sourcePath: "../../docs/wiki/workflows/creative-hub-boundary.md",
      },
      {
        id: "image-generation-confirmation-runtime",
        title: "图片生成确认与统一运行时",
        description: "图片生成确认弹窗、任务运行时和引用素材规则。",
        sourcePath: "../../docs/wiki/workflows/image-generation-confirmation-runtime.md",
      },
    ],
  },
  {
    id: "architecture",
    title: "架构规则",
    description: "模块边界、配置归属、模型选择和图片生成供应商规则。",
    docs: [
      {
        id: "module-boundaries",
        title: "模块边界与文档治理",
        description: "服务器模块、目录收敛和文档治理规则。",
        sourcePath: "../../docs/wiki/architecture/module-boundaries.md",
      },
      {
        id: "configuration-conventions",
        title: "配置项归属与可见性规范",
        description: "运行时配置、设置面板和环境变量的职责边界。",
        sourcePath: "../../docs/wiki/architecture/configuration-conventions.md",
      },
      {
        id: "model-selection",
        title: "当前模型选择与厂商默认模型边界",
        description: "模型供应商、默认模型和路由选择的维护约定。",
        sourcePath: "../../docs/wiki/architecture/model-selection.md",
      },
      {
        id: "image-generation-providers",
        title: "图片生成供应商",
        description: "图片生成 provider 的职责和扩展边界。",
        sourcePath: "../../docs/wiki/architecture/image-generation-providers.md",
      },
    ],
  },
  {
    id: "prompts-rag",
    title: "Prompt 与 RAG",
    description: "结构化输出、Prompt Registry 与知识上下文组装规则。",
    docs: [
      {
        id: "prompt-registry-and-structured-output",
        title: "Prompt Registry 与结构化输出",
        description: "产品级 prompt 注册、schema 和 JSON repair 边界。",
        sourcePath: "../../docs/wiki/prompts/prompt-registry-and-structured-output.md",
      },
      {
        id: "knowledge-and-context-assembly",
        title: "知识库与上下文组装",
        description: "知识检索、RAG 上下文和创作链路资料注入规则。",
        sourcePath: "../../docs/wiki/rag/knowledge-and-context-assembly.md",
      },
    ],
  },
  {
    id: "release",
    title: "更新日志",
    description: "用户可见功能变化的完整历史。",
    docs: [
      {
        id: "release-notes",
        title: "版本更新说明",
        description: "项目完整用户可见更新历史。",
        sourcePath: "../../docs/releases/release-notes.md",
      },
    ],
  },
];

export const flattenedDocs = docsManifest.flatMap((category) =>
  category.docs.map((doc) => ({ ...doc, categoryId: category.id, categoryTitle: category.title })),
);
