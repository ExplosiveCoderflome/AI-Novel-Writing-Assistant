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
    description: "了解项目定位、适合人群和核心能力。",
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
    description: "从下载安装到跑通第一条创作链路。",
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
