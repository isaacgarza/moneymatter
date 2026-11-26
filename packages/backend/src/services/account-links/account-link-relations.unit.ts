import { ACCOUNT_CATEGORIES, ACCOUNT_LINK_RELATIONS, isAccountLinkAllowed } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

const securedBy = (fromCategory: ACCOUNT_CATEGORIES, toCategory: ACCOUNT_CATEGORIES) =>
  isAccountLinkAllowed({ relation: ACCOUNT_LINK_RELATIONS.securedBy, fromCategory, toCategory });

describe('isAccountLinkAllowed', () => {
  it('lets a loan be secured by an asset', () => {
    expect(securedBy(ACCOUNT_CATEGORIES.loan, ACCOUNT_CATEGORIES.vehicle)).toBe(true);
  });

  it('refuses the reverse direction', () => {
    expect(securedBy(ACCOUNT_CATEGORIES.vehicle, ACCOUNT_CATEGORIES.loan)).toBe(false);
  });

  it.each([
    ACCOUNT_CATEGORIES.general,
    ACCOUNT_CATEGORIES.creditCard,
    ACCOUNT_CATEGORIES.investment,
    ACCOUNT_CATEGORIES.loan,
  ])('refuses a loan secured by a %s account', (category) => {
    expect(securedBy(ACCOUNT_CATEGORIES.loan, category)).toBe(false);
  });

  it.each([ACCOUNT_CATEGORIES.general, ACCOUNT_CATEGORIES.creditCard, ACCOUNT_CATEGORIES.vehicle])(
    'refuses a %s account as the secured side',
    (category) => {
      expect(securedBy(category, ACCOUNT_CATEGORIES.vehicle)).toBe(false);
    },
  );

  it('refuses a relation the registry does not know', () => {
    expect(
      isAccountLinkAllowed({
        relation: 'owns' as ACCOUNT_LINK_RELATIONS,
        fromCategory: ACCOUNT_CATEGORIES.loan,
        toCategory: ACCOUNT_CATEGORIES.vehicle,
      }),
    ).toBe(false);
  });
});
