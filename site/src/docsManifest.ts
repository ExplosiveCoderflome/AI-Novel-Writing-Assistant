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
  githubPath: string;
};

export type FlattenedSiteDocEntry = SiteDocEntry & {
  categoryId: string;
  categoryTitle: string;
};

function doc(
  id: string,
  title: string,
  description: string,
  githubPath: string,
): SiteDocEntry {
  return {
    id,
    title,
    description,
    sourcePath: `../../${githubPath}`,
    githubPath,
  };
}

export const docsManifest: SiteDocCategory[] = [
  {
    id: "getting-started",
    title: "开始使用",
    description: "先完成安装、配置和第一条创作路径。",
    docs: [
      doc(
        "introduction",
        "项目介绍",
        "理解项目适合谁、能完成什么，以及长篇生产链如何协作。",
        "docs/public/introduction.md",
      ),
      doc(
        "installation",
        "安装与准备",
        "在 Windows 上安装桌面版，确认模型、存储和知识库选项。",
        "docs/public/installation.md",
      ),
      doc(
        "usage-guide",
        "使用方法",
        "配置模型、创建小说、使用自动导演和章节执行的推荐路径。",
        "docs/public/usage-guide.md",
      ),
      doc(
        "faq",
        "常见问题",
        "快速处理模型不通、章节失败、知识库不命中等高频问题。",
        "docs/public/faq.md",
      ),
      doc(
        "troubleshooting",
        "故障排查",
        "按日志、任务状态、恢复入口和数据备份定位问题。",
        "docs/public/troubleshooting.md",
      ),
    ],
  },
  {
    id: "module-overview",
    title: "模块总览",
    description: "从首页理解各入口的作用和推荐跳转。",
    docs: [
      doc(
        "module-home",
        "首页",
        "查看最近创作入口、任务提醒和常用模块跳转。",
        "docs/public/modules/home.md",
      ),
    ],
  },
  {
    id: "main-chain",
    title: "创作主链",
    description: "围绕开书、推进、恢复和任务状态完成一本小说。",
    docs: [
      doc(
        "module-onboarding",
        "新手上路",
        "第一次使用时按步骤跑通配置、开书和第一章。",
        "docs/public/modules/onboarding.md",
      ),
      doc(
        "module-novels",
        "小说列表",
        "创建、打开、管理和备份你的小说项目。",
        "docs/public/modules/novels.md",
      ),
      doc(
        "module-creative-hub",
        "创作中枢",
        "用对话方式说明目标、发起任务和查看建议。",
        "docs/public/modules/creative-hub.md",
      ),
      doc(
        "module-director-follow-up",
        "导演跟进",
        "查看自动导演进度、暂停原因和下一步恢复入口。",
        "docs/public/modules/director-follow-up.md",
      ),
      doc(
        "module-task-center",
        "任务中心",
        "查看后台任务进度、失败原因和重试策略。",
        "docs/public/modules/task-center.md",
      ),
    ],
  },
  {
    id: "knowledge-writing",
    title: "知识与写法",
    description: "把资料、拆书结果和写法规则变成可召回资产。",
    docs: [
      doc(
        "module-knowledge-base",
        "知识库",
        "保存资料、设定、拆书结论和可检索内容。",
        "docs/public/modules/knowledge-base.md",
      ),
      doc(
        "module-book-analysis",
        "拆书",
        "分析参考作品或自己的稿子并沉淀经验。",
        "docs/public/modules/book-analysis.md",
      ),
      doc(
        "module-style-engine",
        "写法引擎",
        "维护叙事风格、样本文本和写法规则。",
        "docs/public/modules/style-engine.md",
      ),
      doc(
        "module-anti-ai-rules",
        "反 AI 规则",
        "减少正文里的模板感、解释感和空泛表达。",
        "docs/public/modules/anti-ai-rules.md",
      ),
    ],
  },
  {
    id: "story-assets",
    title: "设定资产",
    description: "维护题材、推进方式、角色、世界样本和标题资产。",
    docs: [
      doc(
        "module-genre-base-library",
        "题材基底库",
        "维护题材方向、读者期待和类型卖点。",
        "docs/public/modules/genre-base-library.md",
      ),
      doc(
        "module-progression-mode-library",
        "推进模式库",
        "管理故事推进方式和读者期待兑现。",
        "docs/public/modules/progression-mode-library.md",
      ),
      doc(
        "module-character-library",
        "基础角色库",
        "维护可复用角色和基础形象资产。",
        "docs/public/modules/character-library.md",
      ),
      doc(
        "module-world-sample-library",
        "世界样本库",
        "保存和复用世界观样本。",
        "docs/public/modules/world-sample-library.md",
      ),
      doc(
        "module-title-workshop",
        "标题工坊",
        "生成、筛选和调整书名或章节标题。",
        "docs/public/modules/title-workshop.md",
      ),
    ],
  },
  {
    id: "derived-workshops",
    title: "衍生工坊",
    description: "把小说内容延展为短剧或漫画生产素材。",
    docs: [
      doc(
        "module-short-drama-workspace",
        "短剧工作台",
        "了解小说内容向短剧方向延展的入口。",
        "docs/public/modules/short-drama-workspace.md",
      ),
      doc(
        "module-comic-workspace",
        "漫画工作台",
        "围绕小说内容准备漫画分镜和视觉资产。",
        "docs/public/modules/comic-workspace.md",
      ),
    ],
  },
  {
    id: "system",
    title: "系统配置",
    description: "管理模型供应商、任务路由、提示词和运行偏好。",
    docs: [
      doc(
        "module-system-settings",
        "系统设置",
        "配置模型供应商、API Key、知识库和基础偏好。",
        "docs/public/modules/system-settings.md",
      ),
      doc(
        "module-model-routing",
        "模型路由",
        "为规划、正文、审核等任务分配模型。",
        "docs/public/modules/model-routing.md",
      ),
      doc(
        "module-prompt-management",
        "提示词管理",
        "查看和维护 AI 任务使用的提示词资产。",
        "docs/public/modules/prompt-management.md",
      ),
    ],
  },
  {
    id: "project-updates",
    title: "项目动态",
    description: "查看公开路线图和用户可见更新历史。",
    docs: [
      doc(
        "development-roadmap",
        "公开开发计划",
        "近期、中期、长期的产品演进方向。",
        "docs/public/development-roadmap.md",
      ),
      doc(
        "release-notes",
        "版本更新说明",
        "项目完整用户可见更新历史。",
        "docs/releases/release-notes.md",
      ),
    ],
  },
];

export const flattenedDocs: FlattenedSiteDocEntry[] = docsManifest.flatMap((category) =>
  category.docs.map((doc) => ({ ...doc, categoryId: category.id, categoryTitle: category.title })),
);
