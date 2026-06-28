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
    id: "introduction",
    title: "项目介绍",
    description: "先理解这个工具能帮你完成什么。",
    docs: [
      {
        id: "basic-introduction",
        title: "基础介绍",
        description: "项目是什么、适合谁，以及它如何帮助完成长篇小说。",
        sourcePath: "../../docs/public/basic-introduction.md",
      },
      {
        id: "advanced-introduction",
        title: "进阶介绍",
        description: "面向技术和产品兴趣读者的 AI Native 长篇生产链说明。",
        sourcePath: "../../docs/public/advanced-introduction.md",
      },
    ],
  },
  {
    id: "guide",
    title: "使用指南",
    description: "按步骤创建第一本书并生成第一章。",
    docs: [
      {
        id: "usage-guide",
        title: "使用方法",
        description: "配置模型、创建小说、使用自动导演和章节执行的推荐路径。",
        sourcePath: "../../docs/public/usage-guide.md",
      },
    ],
  },
  {
    id: "modules",
    title: "功能模块",
    description: "按侧栏入口了解每个模块的用途和打开时机。",
    docs: [
      {
        id: "module-home",
        title: "首页",
        description: "查看最近创作入口和任务总览。",
        sourcePath: "../../docs/public/modules/home.md",
      },
      {
        id: "module-onboarding",
        title: "新手上路",
        description: "第一次使用时按步骤跑通创作流程。",
        sourcePath: "../../docs/public/modules/onboarding.md",
      },
      {
        id: "module-novels",
        title: "小说列表",
        description: "创建、打开和管理你的小说项目。",
        sourcePath: "../../docs/public/modules/novels.md",
      },
      {
        id: "module-short-drama-workspace",
        title: "短剧工作台",
        description: "了解小说内容向短剧方向延展的入口。",
        sourcePath: "../../docs/public/modules/short-drama-workspace.md",
      },
      {
        id: "module-comic-workspace",
        title: "漫画工作台",
        description: "围绕小说内容准备漫画分镜和视觉资产。",
        sourcePath: "../../docs/public/modules/comic-workspace.md",
      },
      {
        id: "module-creative-hub",
        title: "创作中枢",
        description: "用对话方式说明目标、发起任务和查看建议。",
        sourcePath: "../../docs/public/modules/creative-hub.md",
      },
      {
        id: "module-book-analysis",
        title: "拆书",
        description: "分析参考作品或自己的稿子并沉淀经验。",
        sourcePath: "../../docs/public/modules/book-analysis.md",
      },
      {
        id: "module-task-center",
        title: "任务中心",
        description: "查看后台任务进度、失败原因和恢复入口。",
        sourcePath: "../../docs/public/modules/task-center.md",
      },
      {
        id: "module-director-follow-up",
        title: "导演跟进",
        description: "查看自动导演进度、暂停原因和下一步。",
        sourcePath: "../../docs/public/modules/director-follow-up.md",
      },
      {
        id: "module-genre-base-library",
        title: "题材基底库",
        description: "维护题材方向、读者期待和类型卖点。",
        sourcePath: "../../docs/public/modules/genre-base-library.md",
      },
      {
        id: "module-progression-mode-library",
        title: "推进模式库",
        description: "管理故事推进方式和读者期待兑现。",
        sourcePath: "../../docs/public/modules/progression-mode-library.md",
      },
      {
        id: "module-title-workshop",
        title: "标题工坊",
        description: "生成、筛选和调整书名或章节标题。",
        sourcePath: "../../docs/public/modules/title-workshop.md",
      },
      {
        id: "module-knowledge-base",
        title: "知识库",
        description: "保存资料、设定、拆书结论和可检索内容。",
        sourcePath: "../../docs/public/modules/knowledge-base.md",
      },
      {
        id: "module-world-sample-library",
        title: "世界样本库",
        description: "保存和复用世界观样本。",
        sourcePath: "../../docs/public/modules/world-sample-library.md",
      },
      {
        id: "module-style-engine",
        title: "写法引擎",
        description: "维护叙事风格、样本文本和写法规则。",
        sourcePath: "../../docs/public/modules/style-engine.md",
      },
      {
        id: "module-anti-ai-rules",
        title: "反 AI 规则",
        description: "减少正文里的模板感、解释感和空泛表达。",
        sourcePath: "../../docs/public/modules/anti-ai-rules.md",
      },
      {
        id: "module-character-library",
        title: "基础角色库",
        description: "维护可复用角色和基础形象资产。",
        sourcePath: "../../docs/public/modules/character-library.md",
      },
      {
        id: "module-prompt-management",
        title: "提示词管理",
        description: "查看和维护 AI 任务使用的提示词资产。",
        sourcePath: "../../docs/public/modules/prompt-management.md",
      },
      {
        id: "module-model-routing",
        title: "模型路由",
        description: "为规划、正文、审核等任务分配模型。",
        sourcePath: "../../docs/public/modules/model-routing.md",
      },
      {
        id: "module-system-settings",
        title: "系统设置",
        description: "配置模型供应商、API Key 和基础偏好。",
        sourcePath: "../../docs/public/modules/system-settings.md",
      },
    ],
  },
  {
    id: "roadmap",
    title: "开发计划",
    description: "查看公开产品路线图和后续重点方向。",
    docs: [
      {
        id: "development-roadmap",
        title: "公开开发计划",
        description: "近期、中期、长期的产品演进方向。",
        sourcePath: "../../docs/public/development-roadmap.md",
      },
    ],
  },
  {
    id: "updates",
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
