import {
  ACCOUNT_CATEGORIES,
  BUDGET_PLAN_ATTACHABLE_ACCOUNT_CATEGORIES,
  DEDICATED_FLOW_ACCOUNT_CATEGORIES,
  GOAL_ELIGIBLE_ACCOUNT_CATEGORIES,
  NET_WORTH_LIABILITY_KINDS,
  getAccountSection,
  isDedicatedFlowAccountCategory,
} from '@bt/shared/types';

// Pins the lists the account-category registry derives, so moving them onto the
// registry cannot change which categories each one holds.
describe('account category derived lists', () => {
  it('dedicated flow holds loan and vehicle', () => {
    expect([...DEDICATED_FLOW_ACCOUNT_CATEGORIES]).toEqual([ACCOUNT_CATEGORIES.loan, ACCOUNT_CATEGORIES.vehicle]);
  });

  it('isDedicatedFlowAccountCategory is true only for loan and vehicle', () => {
    const dedicated = Object.values(ACCOUNT_CATEGORIES).filter(isDedicatedFlowAccountCategory);
    expect(dedicated).toEqual([ACCOUNT_CATEGORIES.loan, ACCOUNT_CATEGORIES.vehicle]);
  });

  it('goal eligible categories', () => {
    expect(new Set(GOAL_ELIGIBLE_ACCOUNT_CATEGORIES)).toEqual(
      new Set([
        ACCOUNT_CATEGORIES.checking,
        ACCOUNT_CATEGORIES.general,
        ACCOUNT_CATEGORIES.cash,
        ACCOUNT_CATEGORIES.saving,
        ACCOUNT_CATEGORIES.investment,
        ACCOUNT_CATEGORIES.crypto,
      ]),
    );
  });

  it('budget plan attachable categories', () => {
    expect(new Set(BUDGET_PLAN_ATTACHABLE_ACCOUNT_CATEGORIES)).toEqual(
      new Set([
        ACCOUNT_CATEGORIES.checking,
        ACCOUNT_CATEGORIES.general,
        ACCOUNT_CATEGORIES.cash,
        ACCOUNT_CATEGORIES.saving,
        ACCOUNT_CATEGORIES.creditCard,
        ACCOUNT_CATEGORIES.overdraft,
      ]),
    );
  });

  it('net worth liability kinds', () => {
    expect([...NET_WORTH_LIABILITY_KINDS]).toEqual([
      ACCOUNT_CATEGORIES.creditCard,
      ACCOUNT_CATEGORIES.loan,
      ACCOUNT_CATEGORIES.overdraft,
    ]);
  });

  it('only vehicle and loan leave the banking section; investment and crypto stay in it', () => {
    const bySection = (section: string) =>
      Object.values(ACCOUNT_CATEGORIES).filter((category) => getAccountSection(category) === section);

    expect(bySection('assets')).toEqual([ACCOUNT_CATEGORIES.vehicle]);
    expect(bySection('loans')).toEqual([ACCOUNT_CATEGORIES.loan]);
    expect(bySection('investing')).toEqual([]);
    expect(bySection('banking')).toEqual(
      Object.values(ACCOUNT_CATEGORIES).filter(
        (category) => category !== ACCOUNT_CATEGORIES.vehicle && category !== ACCOUNT_CATEGORIES.loan,
      ),
    );
  });

  it('an unknown category lands in banking', () => {
    expect(getAccountSection('from-a-newer-server' as ACCOUNT_CATEGORIES)).toBe('banking');
  });
});
