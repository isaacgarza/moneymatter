import { describe, expect, it } from 'vitest';

import { resolveParentLocation } from './parent-route';

const PATHS: Record<string, string> = {
  investments: '/investments',
  portfolioDetail: '/portfolios/:portfolioId',
};

const recordPathByName = (name: string | symbol) => (typeof name === 'string' ? PATHS[name] : undefined);

describe('resolveParentLocation', () => {
  it('is null for a route that declares no parent', () => {
    expect(resolveParentLocation({ route: { meta: {}, params: {} }, recordPathByName })).toBeNull();
  });

  it('names a parent that takes no params without carrying the current ones over', () => {
    const location = resolveParentLocation({
      route: { meta: { parent: 'investments' }, params: { portfolioId: '7' } },
      recordPathByName,
    });

    expect(location).toEqual({ name: 'investments', params: {} });
  });

  it('carries over the params the parent shares by name', () => {
    const location = resolveParentLocation({
      route: { meta: { parent: 'portfolioDetail' }, params: { portfolioId: '7', extra: 'x' } },
      recordPathByName,
    });

    expect(location).toEqual({ name: 'portfolioDetail', params: { portfolioId: '7' } });
  });

  it('is null when the parent needs a param the route does not have', () => {
    const location = resolveParentLocation({
      route: { meta: { parent: 'portfolioDetail' }, params: {} },
      recordPathByName,
    });

    expect(location).toBeNull();
  });

  it('is null when the named parent is not a registered route', () => {
    const location = resolveParentLocation({
      route: { meta: { parent: 'missing' }, params: {} },
      recordPathByName,
    });

    expect(location).toBeNull();
  });
});
