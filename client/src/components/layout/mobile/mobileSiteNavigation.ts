export type MobilePrimaryNavKey = "home" | "novels" | "creation" | "tasks" | "more";

export interface MobileNavItem {
  key: string;
  label: string;
  to: string;
  group: MobilePrimaryNavKey;
}

export interface MobileNavGroup {
  title: string;
  items: MobileNavItem[];
}

export interface MobileRoutePattern {
  key: string;
  pattern: RegExp;
  title: string;
  group: MobilePrimaryNavKey;
}

export const MOBILE_ROUTE_PATTERNS: MobileRoutePattern[] = [
  { key: "home", pattern: /^\/$/, title: "首页", group: "home" },
  { key: "novels", pattern: /^\/novels\/?$/, title: "小说", group: "novels" },
  { key: "novel-create", pattern: /^\/novels\/create\/?$/, title: "创建小说", group: "novels" },
  { key: "novel-edit", pattern: /^\/novels\/[^/]+\/edit\/?$/, title: "小说工作区", group: "novels" },
  { key: "chapter-edit", pattern: /^\/novels\/[^/]+\/chapters\/[^/]+\/?$/, title: "章节正文", group: "novels" },
  { key: "creative-hub", pattern: /^\/creative-hub\/?$/, title: "创作中枢", group: "creation" },
  { key: "chat-legacy", pattern: /^\/chat-legacy\/?$/, title: "旧版聊天", group: "creation" },
  { key: "book-analysis", pattern: /^\/book-analysis\/?$/, title: "拆书", group: "creation" },
  { key: "tasks", pattern: /^\/tasks\/?$/, title: "任务", group: "tasks" },
  { key: "auto-director-follow-ups", pattern: /^\/auto-director\/follow-ups\/?$/, title: "导演跟进", group: "tasks" },
  { key: "knowledge", pattern: /^\/knowledge\/?$/, title: "知识库", group: "more" },
  { key: "genres", pattern: /^\/genres\/?$/, title: "题材基底", group: "more" },
  { key: "story-modes", pattern: /^\/story-modes\/?$/, title: "推进模式", group: "more" },
  { key: "titles", pattern: /^\/titles\/?$/, title: "标题工坊", group: "more" },
  { key: "model-routes", pattern: /^\/settings\/model-routes\/?$/, title: "模型路由", group: "more" },
  { key: "settings", pattern: /^\/settings\/?$/, title: "系统设置", group: "more" },
  { key: "worlds", pattern: /^\/worlds\/?$/, title: "世界观", group: "more" },
  { key: "world-generator", pattern: /^\/worlds\/generator\/?$/, title: "世界生成", group: "more" },
  { key: "world-workspace", pattern: /^\/worlds\/[^/]+\/workspace\/?$/, title: "世界工作台", group: "more" },
  { key: "style-engine", pattern: /^\/style-engine\/?$/, title: "写法引擎", group: "more" },
  { key: "base-characters", pattern: /^\/base-characters\/?$/, title: "基础角色", group: "more" },
];

const primaryNavItems: MobileNavItem[] = [
  { key: "home", label: "首页", to: "/", group: "home" },
  { key: "novels", label: "小说", to: "/novels", group: "novels" },
  { key: "creation", label: "创作", to: "/creative-hub", group: "creation" },
  { key: "tasks", label: "任务", to: "/tasks", group: "tasks" },
  { key: "more", label: "更多", to: "", group: "more" },
];

const moreNavGroups: MobileNavGroup[] = [
  {
    title: "创作辅助",
    items: [
      { key: "book-analysis", label: "拆书", to: "/book-analysis", group: "creation" },
      { key: "auto-director-follow-ups", label: "导演跟进", to: "/auto-director/follow-ups", group: "tasks" },
      { key: "chat-legacy", label: "旧版聊天", to: "/chat-legacy", group: "creation" },
    ],
  },
  {
    title: "资产库",
    items: [
      { key: "knowledge", label: "知识库", to: "/knowledge", group: "more" },
      { key: "genres", label: "题材基底", to: "/genres", group: "more" },
      { key: "story-modes", label: "推进模式", to: "/story-modes", group: "more" },
      { key: "titles", label: "标题工坊", to: "/titles", group: "more" },
      { key: "style-engine", label: "写法引擎", to: "/style-engine", group: "more" },
      { key: "base-characters", label: "基础角色", to: "/base-characters", group: "more" },
    ],
  },
  {
    title: "世界与系统",
    items: [
      { key: "worlds", label: "世界观", to: "/worlds", group: "more" },
      { key: "world-generator", label: "世界生成", to: "/worlds/generator", group: "more" },
      { key: "model-routes", label: "模型路由", to: "/settings/model-routes", group: "more" },
      { key: "settings", label: "系统设置", to: "/settings", group: "more" },
    ],
  },
];

export function getMobilePrimaryNavItems(): MobileNavItem[] {
  return primaryNavItems;
}

export function getMobileMoreNavGroups(): MobileNavGroup[] {
  return moreNavGroups;
}

export function getMobileRoutePattern(pathname: string): MobileRoutePattern | undefined {
  return MOBILE_ROUTE_PATTERNS.find((route) => route.pattern.test(pathname));
}

export function getMobilePageTitle(pathname: string): string {
  return getMobileRoutePattern(pathname)?.title ?? "更多功能";
}

export function getMobileNavGroupForPath(pathname: string): MobilePrimaryNavKey {
  return getMobileRoutePattern(pathname)?.group ?? "more";
}

export function getMobileRouteClassName(pathname: string): string {
  return `mobile-route-${getMobileRoutePattern(pathname)?.key ?? "more"}`;
}
