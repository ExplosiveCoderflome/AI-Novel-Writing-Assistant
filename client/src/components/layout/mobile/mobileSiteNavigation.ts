import i18next from "i18next";
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
  { key: "home", pattern: /^\/$/, title: i18next.t("sidebar.home"), group: "home" },
  { key: "help", pattern: /^\/help\/?$/, title: i18next.t("dict.gen_c46d213c"), group: "more" },
  { key: "novels", pattern: /^\/novels\/?$/, title: i18next.t("dict.gen_1fb52965"), group: "novels" },
  { key: "novel-create", pattern: /^\/novels\/create\/?$/, title: i18next.t("dict.gen_14196ad0"), group: "novels" },
  { key: "novel-preview", pattern: /^\/novels\/[^/]+\/preview\/?$/, title: i18next.t("dict.gen_38cb41c9"), group: "novels" },
  { key: "novel-simple", pattern: /^\/novels\/[^/]+\/simple\/?$/, title: i18next.t("layout.mobileSiteNavigation.dkisat"), group: "novels" },
  { key: "novel-edit", pattern: /^\/novels\/[^/]+\/edit\/?$/, title: i18next.t("dict.gen_918c18fe"), group: "novels" },
  { key: "chapter-edit", pattern: /^\/novels\/[^/]+\/chapters\/[^/]+\/?$/, title: i18next.t("dict.gen_a90e9b2a"), group: "novels" },
  { key: "multimedia", pattern: /^\/multimedia\/?$/, title: i18next.t("sidebar.multimedia"), group: "creation" },
  { key: "creative-hub", pattern: /^\/creative-hub\/?$/, title: i18next.t("sidebar.creativeHub"), group: "creation" },
  { key: "chat-legacy", pattern: /^\/chat-legacy\/?$/, title: i18next.t("dict.gen_e5c1dd7f"), group: "creation" },
  { key: "book-analysis", pattern: /^\/book-analysis\/?$/, title: i18next.t("sidebar.bookAnalysis"), group: "creation" },
  { key: "tasks", pattern: /^\/tasks\/?$/, title: i18next.t("dict.task"), group: "tasks" },
  { key: "auto-director-follow-ups", pattern: /^\/auto-director\/follow-ups\/?$/, title: i18next.t("sidebar.autoDirector"), group: "tasks" },
  { key: "knowledge", pattern: /^\/knowledge\/?$/, title: i18next.t("sidebar.knowledge"), group: "more" },
  { key: "genres", pattern: /^\/genres\/?$/, title: i18next.t("basicInfo.genreId"), group: "more" },
  { key: "story-modes", pattern: /^\/story-modes\/?$/, title: i18next.t("dict.gen_f190fd10"), group: "more" },
  { key: "titles", pattern: /^\/titles\/?$/, title: i18next.t("sidebar.titles"), group: "more" },
  { key: "prompt-workbench", pattern: /^\/prompt-workbench\/?$/, title: i18next.t("sidebar.prompts"), group: "more" },
  { key: "model-routes", pattern: /^\/settings\/model-routes\/?$/, title: i18next.t("sidebar.modelRoutes"), group: "more" },
  { key: "settings", pattern: /^\/settings\/?$/, title: i18next.t("sidebar.settings"), group: "more" },
  { key: "worlds", pattern: /^\/worlds\/?$/, title: i18next.t("sidebar.worlds"), group: "more" },
  { key: "world-generator", pattern: /^\/worlds\/generator\/?$/, title: i18next.t("dict.gen_85d21f84"), group: "more" },
  { key: "world-workspace", pattern: /^\/worlds\/[^/]+\/workspace\/?$/, title: i18next.t("dict.worldManual"), group: "more" },
  { key: "style-engine", pattern: /^\/style-engine\/?$/, title: i18next.t("sidebar.styleEngine"), group: "more" },
  { key: "anti-ai-rules", pattern: /^\/anti-ai-rules\/?$/, title: i18next.t("sidebar.antiAiRules"), group: "more" },
  { key: "base-characters", pattern: /^\/base-characters\/?$/, title: i18next.t("dict.gen_9a36d1be"), group: "more" },

];

const primaryNavItems: MobileNavItem[] = [
  { key: "home", label: i18next.t("sidebar.home"), to: "/", group: "home" },
  { key: "novels", label: i18next.t("dict.gen_1fb52965"), to: "/novels", group: "novels" },
  { key: "creation", label: i18next.t("dict.gen_93d695ff"), to: "/creative-hub", group: "creation" },
  { key: "tasks", label: i18next.t("dict.task"), to: "/tasks", group: "tasks" },
  { key: "more", label: i18next.t("dict.gen_0ec9eaf9"), to: "", group: "more" },
];

const moreNavGroups: MobileNavGroup[] = [
  {
    title: i18next.t("dict.gen_27027b86"),
    items: [
      { key: "help", label: i18next.t("dict.gen_c46d213c"), to: "/help", group: "more" },
      { key: "multimedia", label: i18next.t("sidebar.multimedia"), to: "/multimedia", group: "creation" },
      { key: "book-analysis", label: i18next.t("sidebar.bookAnalysis"), to: "/book-analysis", group: "creation" },
      { key: "auto-director-follow-ups", label: i18next.t("sidebar.autoDirector"), to: "/auto-director/follow-ups", group: "tasks" },
      { key: "chat-legacy", label: i18next.t("dict.gen_e5c1dd7f"), to: "/chat-legacy", group: "creation" },
    ],
  },
  {
    title: i18next.t("dict.gen_e3b6b01a"),
    items: [
      { key: "knowledge", label: i18next.t("sidebar.knowledge"), to: "/knowledge", group: "more" },
      { key: "genres", label: i18next.t("basicInfo.genreId"), to: "/genres", group: "more" },
      { key: "story-modes", label: i18next.t("dict.gen_f190fd10"), to: "/story-modes", group: "more" },
      { key: "titles", label: i18next.t("sidebar.titles"), to: "/titles", group: "more" },
      { key: "style-engine", label: i18next.t("sidebar.styleEngine"), to: "/style-engine", group: "more" },
      { key: "anti-ai-rules", label: i18next.t("sidebar.antiAiRules"), to: "/anti-ai-rules", group: "more" },
      { key: "base-characters", label: i18next.t("dict.gen_9a36d1be"), to: "/base-characters", group: "more" },
    ],
  },
  {
    title: i18next.t("dict.worldAndSystem"),
    items: [
      { key: "worlds", label: i18next.t("sidebar.worlds"), to: "/worlds", group: "more" },
      { key: "world-generator", label: i18next.t("dict.gen_85d21f84"), to: "/worlds/generator", group: "more" },
      { key: "prompt-workbench", label: i18next.t("sidebar.prompts"), to: "/prompt-workbench", group: "more" },
      { key: "model-routes", label: i18next.t("sidebar.modelRoutes"), to: "/settings/model-routes", group: "more" },
      { key: "settings", label: i18next.t("sidebar.settings"), to: "/settings", group: "more" },
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
  return getMobileRoutePattern(pathname)?.title ?? i18next.t("dict.gen_28aa29f5");
}

export function getMobileNavGroupForPath(pathname: string): MobilePrimaryNavKey {
  return getMobileRoutePattern(pathname)?.group ?? "more";
}

export function getMobileRouteClassName(pathname: string): string {
  return `mobile-route-${getMobileRoutePattern(pathname)?.key ?? "more"}`;
}
