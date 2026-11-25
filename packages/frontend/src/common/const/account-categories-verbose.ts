import { ACCOUNT_CATEGORIES, ACCOUNT_CATEGORY_REGISTRY } from '@bt/shared/types';

/**
 * Maps account category enum values to their translation keys, taken from the account category registry.
 * Use with t() from vue-i18n: t(ACCOUNT_CATEGORIES_TRANSLATION_KEYS[category])
 */
export const ACCOUNT_CATEGORIES_TRANSLATION_KEYS = Object.freeze<Record<ACCOUNT_CATEGORIES, string>>(
  Object.fromEntries(
    Object.values(ACCOUNT_CATEGORIES).map((category) => [category, ACCOUNT_CATEGORY_REGISTRY[category].labelKey]),
  ) as Record<ACCOUNT_CATEGORIES, string>,
);
