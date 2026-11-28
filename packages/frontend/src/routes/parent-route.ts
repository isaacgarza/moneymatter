import type { RouteLocationNormalizedLoaded, RouteLocationRaw, RouteRecordNameGeneric } from 'vue-router';

const PATH_PARAM_PATTERN = /:([A-Za-z0-9_]+)/g;

/** Names the path parameters a route path declares, e.g. `/portfolios/:portfolioId` gives `portfolioId`. */
const pathParamNames = ({ path }: { path: string }): string[] =>
  Array.from(path.matchAll(PATH_PARAM_PATTERN), (match) => match[1]!);

/**
 * Where "up" is for the current route: the route named by `meta.parent`, carrying over the params
 * the two routes share by name. A parent that needs a param the current route lacks resolves to `null`.
 */
export const resolveParentLocation = ({
  route,
  recordPathByName,
}: {
  route: Pick<RouteLocationNormalizedLoaded, 'meta' | 'params'>;
  recordPathByName: (name: RouteRecordNameGeneric) => string | undefined;
}): RouteLocationRaw | null => {
  const parentName = route.meta.parent;
  if (!parentName) return null;

  const parentPath = recordPathByName(parentName);
  if (parentPath === undefined) return null;

  const params: Record<string, string | string[]> = {};
  for (const name of pathParamNames({ path: parentPath })) {
    const value = route.params[name];
    if (value === undefined) return null;
    params[name] = value;
  }

  return { name: parentName, params };
};
