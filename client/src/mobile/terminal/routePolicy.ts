import { matchPath } from "react-router-dom";

export type MobileTerminalRoute = { kind: "shelf" | "records" | "notifications" | "desktop" }
  | { kind: "novel"; novelId: string; chapterId?: string };

export function resolveMobileTerminalRoute(pathname: string): MobileTerminalRoute {
  if (pathname === "/" || pathname === "/novels" || pathname === "/novels/") return { kind: "shelf" };
  if (pathname === "/tasks" || pathname === "/lab/director") return { kind: "records" };
  if (pathname === "/auto-director/follow-ups") return { kind: "notifications" };
  for (const pattern of ["/novels/:id/chapters/:chapterId", "/novels/:id/edit", "/novels/:id/preview", "/novels/:id/simple", "/lab/director/:id"]) {
    const match = matchPath(pattern, pathname);
    if (match?.params.id) return { kind: "novel", novelId: decodeURIComponent(match.params.id), chapterId: match.params.chapterId ? decodeURIComponent(match.params.chapterId) : undefined };
  }
  return { kind: "desktop" };
}
