import 'vue-router';

import type { RouteRecordNameGeneric } from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * The route one level up. The header back arrow goes there when there is no in-app history to step
     * back through, for example after opening a link directly.
     */
    parent?: RouteRecordNameGeneric;
  }
}
