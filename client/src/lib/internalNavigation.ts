function getCurrentHref(): string {
  if (typeof window === "undefined") {
    return "http://localhost/";
  }
  return window.location.href;
}

export function resolveInternalNavigationTarget(
  targetUrl: string | null | undefined,
  currentHref = getCurrentHref(),
): string | null {
  const rawTarget = targetUrl?.trim();
  if (!rawTarget) {
    return null;
  }

  if (rawTarget.startsWith("#/")) {
    return rawTarget.slice(1);
  }

  if (rawTarget.startsWith("/") && !rawTarget.startsWith("//")) {
    return rawTarget;
  }

  try {
    const currentUrl = new URL(currentHref);
    const parsedTarget = new URL(rawTarget, currentUrl);
    if (parsedTarget.origin !== currentUrl.origin) {
      return null;
    }

    if (parsedTarget.hash.startsWith("#/")) {
      return parsedTarget.hash.slice(1);
    }

    return `${parsedTarget.pathname}${parsedTarget.search}${parsedTarget.hash}`;
  } catch {
    return null;
  }
}
