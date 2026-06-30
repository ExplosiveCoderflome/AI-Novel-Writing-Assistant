export const SITE_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL);

export type SiteRoute = { page: "home" } | { page: "docs"; docId?: string };

function normalizeBasePath(base: string): string {
  if (!base || base === "./") {
    return "/";
  }
  const withSlashes = `/${base.replace(/^\/+|\/+$/g, "")}/`;
  return withSlashes.replace(/\/+/g, "/");
}

function stripBasePath(pathname: string): string {
  const cleanPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (SITE_BASE_PATH !== "/" && cleanPathname.startsWith(SITE_BASE_PATH)) {
    return `/${cleanPathname.slice(SITE_BASE_PATH.length)}`.replace(/\/+/g, "/");
  }
  const baseWithoutTrailingSlash = SITE_BASE_PATH.replace(/\/$/, "");
  if (baseWithoutTrailingSlash && cleanPathname === baseWithoutTrailingSlash) {
    return "/";
  }
  return cleanPathname;
}

export function sitePath(path = "/"): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const baseWithoutTrailingSlash = SITE_BASE_PATH.replace(/\/$/, "");
  if (cleanPath === "/") {
    return SITE_BASE_PATH;
  }
  return `${baseWithoutTrailingSlash}${cleanPath}`;
}

export function docsPath(docId?: string): string {
  return sitePath(docId ? `/docs/${encodeURIComponent(docId)}` : "/docs");
}

export function isSitePath(pathname: string): boolean {
  if (SITE_BASE_PATH === "/") {
    return pathname.startsWith("/");
  }
  return pathname === SITE_BASE_PATH.replace(/\/$/, "") || pathname.startsWith(SITE_BASE_PATH);
}

export function normalizeRoutePath(pathname: string): string {
  const routePath = stripBasePath(pathname);
  return routePath === "" ? "/" : routePath;
}

export function parseRoute(pathname: string): SiteRoute {
  const routePath = normalizeRoutePath(pathname);
  if (routePath === "/docs" || routePath === "/docs/") {
    return { page: "docs" };
  }
  if (routePath.startsWith("/docs/")) {
    return { page: "docs", docId: decodeURIComponent(routePath.replace(/^\/docs\//, "")) };
  }
  return { page: "home" };
}
