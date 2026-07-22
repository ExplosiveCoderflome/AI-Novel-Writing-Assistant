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
  { key: "home", pattern: /^\/$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_db1c89e0"), group: "home" },
  { key: "help", pattern: /^\/help\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_c46d213c"), group: "more" },
  { key: "novels", pattern: /^\/novels\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_1fb52965"), group: "novels" },
  { key: "novel-create", pattern: /^\/novels\/create\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_14196ad0"), group: "novels" },
  { key: "novel-preview", pattern: /^\/novels\/[^/]+\/preview\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_38cb41c9"), group: "novels" },
  { key: "novel-edit", pattern: /^\/novels\/[^/]+\/edit\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_918c18fe"), group: "novels" },
  { key: "chapter-edit", pattern: /^\/novels\/[^/]+\/chapters\/[^/]+\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_a90e9b2a"), group: "novels" },
  { key: "multimedia", pattern: /^\/multimedia\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.multimedia"), group: "creation" },
  { key: "creative-hub", pattern: /^\/creative-hub\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_d50f61ff"), group: "creation" },
  { key: "chat-legacy", pattern: /^\/chat-legacy\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_e5c1dd7f"), group: "creation" },
  { key: "book-analysis", pattern: /^\/book-analysis\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_f0dc6198"), group: "creation" },
  { key: "tasks", pattern: /^\/tasks\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.task"), group: "tasks" },
  { key: "auto-director-follow-ups", pattern: /^\/auto-director\/follow-ups\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_ad254401"), group: "tasks" },
  { key: "knowledge", pattern: /^\/knowledge\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_7e433388"), group: "more" },
  { key: "genres", pattern: /^\/genres\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_daa08375"), group: "more" },
  { key: "story-modes", pattern: /^\/story-modes\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_f190fd10"), group: "more" },
  { key: "titles", pattern: /^\/titles\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_ca04046b"), group: "more" },
  { key: "prompt-workbench", pattern: /^\/prompt-workbench\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_1a7ca290"), group: "more" },
  { key: "model-routes", pattern: /^\/settings\/model-routes\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_0361f422"), group: "more" },
  { key: "settings", pattern: /^\/settings\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_14097695"), group: "more" },
  { key: "worlds", pattern: /^\/worlds\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.worldSampleLibrary"), group: "more" },
  { key: "world-generator", pattern: /^\/worlds\/generator\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_85d21f84"), group: "more" },
  { key: "world-workspace", pattern: /^\/worlds\/[^/]+\/workspace\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.worldManual"), group: "more" },
  { key: "style-engine", pattern: /^\/style-engine\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_da3a12f6"), group: "more" },
  { key: "anti-ai-rules", pattern: /^\/anti-ai-rules\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_d6a7d091"), group: "more" },
  { key: "base-characters", pattern: /^\/base-characters\/?$/, title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_9a36d1be"), group: "more" },
];

const primaryNavItems: MobileNavItem[] = [
  { key: "home", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_db1c89e0"), to: "/", group: "home" },
  { key: "novels", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_1fb52965"), to: "/novels", group: "novels" },
  { key: "creation", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_93d695ff"), to: "/creative-hub", group: "creation" },
  { key: "tasks", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.task"), to: "/tasks", group: "tasks" },
  { key: "more", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_0ec9eaf9"), to: "", group: "more" },
];

const moreNavGroups: MobileNavGroup[] = [
  {
    title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_27027b86"),
    items: [
      { key: "help", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_c46d213c"), to: "/help", group: "more" },
      { key: "multimedia", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.multimedia"), to: "/multimedia", group: "creation" },
      { key: "book-analysis", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_f0dc6198"), to: "/book-analysis", group: "creation" },
      { key: "auto-director-follow-ups", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_ad254401"), to: "/auto-director/follow-ups", group: "tasks" },
      { key: "chat-legacy", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_e5c1dd7f"), to: "/chat-legacy", group: "creation" },
    ],
  },
  {
    title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_e3b6b01a"),
    items: [
      { key: "knowledge", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_7e433388"), to: "/knowledge", group: "more" },
      { key: "genres", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_daa08375"), to: "/genres", group: "more" },
      { key: "story-modes", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_f190fd10"), to: "/story-modes", group: "more" },
      { key: "titles", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_ca04046b"), to: "/titles", group: "more" },
      { key: "style-engine", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_da3a12f6"), to: "/style-engine", group: "more" },
      { key: "anti-ai-rules", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_d6a7d091"), to: "/anti-ai-rules", group: "more" },
      { key: "base-characters", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_9a36d1be"), to: "/base-characters", group: "more" },
    ],
  },
  {
    title: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.worldAndSystem"),
    items: [
      { key: "worlds", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.worldSampleLibrary"), to: "/worlds", group: "more" },
      { key: "world-generator", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_85d21f84"), to: "/worlds/generator", group: "more" },
      { key: "prompt-workbench", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_1a7ca290"), to: "/prompt-workbench", group: "more" },
      { key: "model-routes", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_0361f422"), to: "/settings/model-routes", group: "more" },
      { key: "settings", label: i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_14097695"), to: "/settings", group: "more" },
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
  return getMobileRoutePattern(pathname)?.title ?? i18next.t("gen.components.layout.mobile.mobileSiteNavigation.gen_28aa29f5");
}

export function getMobileNavGroupForPath(pathname: string): MobilePrimaryNavKey {
  return getMobileRoutePattern(pathname)?.group ?? "more";
}

export function getMobileRouteClassName(pathname: string): string {
  return `mobile-route-${getMobileRoutePattern(pathname)?.key ?? "more"}`;
}
