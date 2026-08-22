export type AuthRedirect = "/login" | "/projects" | null;

export function resolveAuthRedirect(
  hasAuthenticatedUser: boolean,
  firstRouteSegment: string | undefined,
  isAuthLoading = false
): AuthRedirect {
  if (isAuthLoading) {
    return null;
  }
  const isLoginRoute = firstRouteSegment === "login";
  const isRootRoute = firstRouteSegment === undefined || firstRouteSegment === "index";
  if (!hasAuthenticatedUser && !isLoginRoute) {
    return "/login";
  }
  if (hasAuthenticatedUser && (isLoginRoute || isRootRoute)) {
    return "/projects";
  }
  return null;
}
