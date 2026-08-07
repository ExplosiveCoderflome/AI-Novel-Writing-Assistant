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
  { key: "home", pattern: /^\/$/, title: "front page", group: "home" },
  { key: "help", pattern: /^\/help\/?$/, title: "Creation Wizard", group: "more" },
  { key: "novels", pattern: /^\/novels\/?$/, title: "novel", group: "novels" },
  { key: "novel-create", pattern: /^\/novels\/create\/?$/, title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", group: "novels" },
  { key: "novel-preview", pattern: /^\/novels\/[^/]+\/preview\/?$/, title: "Novel preview", group: "novels" },
  { key: "novel-edit", pattern: /^\/novels\/[^/]+\/edit\/?$/, title: "Novel workspace", group: "novels" },
  { key: "chapter-edit", pattern: /^\/novels\/[^/]+\/chapters\/[^/]+\/?$/, title: "Chapter text", group: "novels" },
  { key: "drama", pattern: /^\/drama\/?$/, title: "skit", group: "creation" },
  { key: "creative-hub", pattern: /^\/creative-hub\/?$/, title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", group: "creation" },
  { key: "chat-legacy", pattern: /^\/chat-legacy\/?$/, title: "Old version of chat", group: "creation" },
  { key: "book-analysis", pattern: /^\/book-analysis\/?$/, title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", group: "creation" },
  { key: "tasks", pattern: /^\/tasks\/?$/, title: "Task", group: "tasks" },
  { key: "auto-director-follow-ups", pattern: /^\/auto-director\/follow-ups\/?$/, title: "Director follow up", group: "tasks" },
  { key: "knowledge", pattern: /^\/knowledge\/?$/, title: "knowledge base", group: "more" },
  { key: "genres", pattern: /^\/genres\/?$/, title: "Theme base", group: "more" },
  { key: "story-modes", pattern: /^\/story-modes\/?$/, title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", group: "more" },
  { key: "titles", pattern: /^\/titles\/?$/, title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", group: "more" },
  { key: "prompt-workbench", pattern: /^\/prompt-workbench\/?$/, title: "Prompt word management", group: "more" },
  { key: "model-routes", pattern: /^\/settings\/model-routes\/?$/, title: "model routing", group: "more" },
  { key: "settings", pattern: /^\/settings\/?$/, title: "System settings", group: "more" },
  { key: "worlds", pattern: /^\/worlds\/?$/, title: "World Sample Library", group: "more" },
  { key: "world-generator", pattern: /^\/worlds\/generator\/?$/, title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", group: "more" },
  { key: "world-workspace", pattern: /^\/worlds\/[^/]+\/workspace\/?$/, title: "world manual", group: "more" },
  { key: "style-engine", pattern: /^\/style-engine\/?$/, title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", group: "more" },
  { key: "anti-ai-rules", pattern: /^\/anti-ai-rules\/?$/, title: "Anti-AI rules", group: "more" },
  { key: "base-characters", pattern: /^\/base-characters\/?$/, title: "Basic role", group: "more" },
];

const primaryNavItems: MobileNavItem[] = [
  { key: "home", label: "front page", to: "/", group: "home" },
  { key: "novels", label: "novel", to: "/novels", group: "novels" },
  { key: "creation", label: "creation", to: "/creative-hub", group: "creation" },
  { key: "tasks", label: "Task", to: "/tasks", group: "tasks" },
  { key: "more", label: "More", to: "", group: "more" },
];

const moreNavGroups: MobileNavGroup[] = [
  {
    title: "creative assistance",
    items: [
      { key: "help", label: "Creation Wizard", to: "/help", group: "more" },
      { key: "drama", label: "Short drama workbench", to: "/drama", group: "creation" },
      { key: "book-analysis", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", to: "/book-analysis", group: "creation" },
      { key: "auto-director-follow-ups", label: "Director follow up", to: "/auto-director/follow-ups", group: "tasks" },
      { key: "chat-legacy", label: "Old version of chat", to: "/chat-legacy", group: "creation" },
    ],
  },
  {
    title: "Asset Library",
    items: [
      { key: "knowledge", label: "knowledge base", to: "/knowledge", group: "more" },
      { key: "genres", label: "Theme base", to: "/genres", group: "more" },
      { key: "story-modes", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", to: "/story-modes", group: "more" },
      { key: "titles", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", to: "/titles", group: "more" },
      { key: "style-engine", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", to: "/style-engine", group: "more" },
      { key: "anti-ai-rules", label: "Anti-AI rules", to: "/anti-ai-rules", group: "more" },
      { key: "base-characters", label: "Basic role", to: "/base-characters", group: "more" },
    ],
  },
  {
    title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    items: [
      { key: "worlds", label: "World Sample Library", to: "/worlds", group: "more" },
      { key: "world-generator", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", to: "/worlds/generator", group: "more" },
      { key: "prompt-workbench", label: "Prompt word management", to: "/prompt-workbench", group: "more" },
      { key: "model-routes", label: "model routing", to: "/settings/model-routes", group: "more" },
      { key: "settings", label: "System settings", to: "/settings", group: "more" },
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
  return getMobileRoutePattern(pathname)?.title ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
}

export function getMobileNavGroupForPath(pathname: string): MobilePrimaryNavKey {
  return getMobileRoutePattern(pathname)?.group ?? "more";
}

export function getMobileRouteClassName(pathname: string): string {
  return `mobile-route-${getMobileRoutePattern(pathname)?.key ?? "more"}`;
}
