export function resolvePublicAssetUrl(assetPath: string): string {
  const normalizedPath = assetPath.replace(/^\/+/, "");
  return new URL(`${import.meta.env.BASE_URL}${normalizedPath}`, window.location.href).toString();
}

export function openPublicAssetUrl(
  assetPath: string,
  target = "_blank",
  features?: string,
): Window | null {
  return window.open(resolvePublicAssetUrl(assetPath), target, features);
}

function normalizeRoutePath(routePath: string): string {
  return routePath.startsWith("/") ? routePath : `/${routePath}`;
}

function isDesktopRouteContext(): boolean {
  return typeof window !== "undefined" && (
    Boolean(window.kanvasDesktop) || window.location.protocol === "file:"
  );
}

export function resolveAppRouteUrl(routePath: string): string {
  const normalizedPath = normalizeRoutePath(routePath);

  if (isDesktopRouteContext()) {
    return `${window.location.origin}${window.location.pathname}#${normalizedPath}`;
  }

  return normalizedPath;
}

export function openAppRouteUrl(
  routePath: string,
  target = "_blank",
  features?: string,
): Window | null {
  return window.open(resolveAppRouteUrl(routePath), target, features);
}

export function resolveHashRouteUrl(routePath: string): string {
  const normalizedPath = normalizeRoutePath(routePath);
  return `${window.location.origin}${window.location.pathname}#${normalizedPath}`;
}

export function openHashRouteUrl(
  routePath: string,
  target = "_blank",
  features?: string,
): Window | null {
  return window.open(resolveHashRouteUrl(routePath), target, features);
}
