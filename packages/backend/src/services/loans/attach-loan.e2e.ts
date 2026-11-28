import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, API_ERROR_CODES, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { SIMPLEFIN_ACCOUNT_1, getMockedSimplefinAccountSet } from '@tests/mocks/simplefin/data';
import { VALID_SIMPLEFIN_SETUP_TOKEN, getSimplefinAccountsMock } from '@tests/mocks/simplefin/mock-api';

/** A bank-synced account: the only kind loan details can be attached to. */
const createSyncedAccount = async (): Promise<string> => {
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
    credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
    raw: true,
  });
  global.mswMockServer.use(getSimplefinAccountsMock({ response: getMockedSimplefinAccountSet({}) }));
  const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: [SIMPLEFIN_ACCOUNT_1],
    raw: true,
  });
  return syncedAccounts[0]!.id;
};

describe('POST /loans/attach', () => {
  it('adds loan details to a synced account and leaves its balance to the bank', async () => {
    const accountId = await createSyncedAccount();
    const before = await helpers.getAccount({ id: accountId, raw: true });
    expect(before.type).not.toBe(ACCOUNT_TYPES.system);

    const loan = await helpers.attachLoan({
      payload: helpers.buildAttachLoanPayload({ accountId }),
      raw: true,
    });

    expect(loan.id).toBe(accountId);
    expect(loan.loanDetails.interestRate).toBe(6);
    expect(loan.loanDetails.lenderName).toBe('Chase');

    const after = await helpers.getAccount({ id: accountId, raw: true });
    expect(after.accountCategory).toBe(ACCOUNT_CATEGORIES.loan);
    expect(after.type).toBe(before.type);
    expect(after.currentBalance).toEqual(before.currentBalance);

    const listed = await helpers.getLoans({ raw: true });
    expect(listed.map((item) => item.id)).toContain(accountId);
  });

  it('rejects a manually tracked account', async () => {
    const account = await helpers.createAccount({ raw: true });

    const result = await helpers.attachLoan({
      payload: helpers.buildAttachLoanPayload({ accountId: account.id }),
      raw: false,
    });

    expect(result.statusCode).toBe(422);
    expect((result.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.validationError);
  });

  it('rejects an account that already has loan details', async () => {
    const accountId = await createSyncedAccount();
    await helpers.attachLoan({ payload: helpers.buildAttachLoanPayload({ accountId }), raw: true });

    const second = await helpers.attachLoan({
      payload: helpers.buildAttachLoanPayload({ accountId }),
      raw: false,
    });

    expect(second.statusCode).toBe(422);
  });

  it('returns 404 for an account that is not the caller’s', async () => {
    const result = await helpers.attachLoan({
      payload: helpers.buildAttachLoanPayload({ accountId: generateRandomRecordId() }),
      raw: false,
    });

    expect(result.statusCode).toBe(404);
  });

  it('rejects an invalid loan field', async () => {
    const accountId = await createSyncedAccount();

    const result = await helpers.attachLoan({
      payload: helpers.buildAttachLoanPayload({ accountId, interestRate: -1 }),
      raw: false,
    });

    expect(result.statusCode).toBe(422);
  });

  describe('on an attached loan', () => {
    it('edits the loan details but refuses a balance correction', async () => {
      const accountId = await createSyncedAccount();
      await helpers.attachLoan({ payload: helpers.buildAttachLoanPayload({ accountId }), raw: true });

      const edited = await helpers.updateLoan({ id: accountId, payload: { interestRate: 5.5 }, raw: true });
      expect(edited.loanDetails.interestRate).toBe(5.5);

      const correction = await helpers.updateLoan({ id: accountId, payload: { currentBalance: 1_000 }, raw: false });
      expect(correction.statusCode).toBe(422);
    });

    it('removing the loan keeps the synced account and returns it to Uncategorized', async () => {
      const accountId = await createSyncedAccount();
      const before = await helpers.getAccount({ id: accountId, raw: true });
      await helpers.attachLoan({ payload: helpers.buildAttachLoanPayload({ accountId }), raw: true });

      const removed = await helpers.deleteLoan({ id: accountId, raw: false });
      expect(removed.statusCode).toBe(204);

      const account = await helpers.getAccount({ id: accountId, raw: true });
      expect(account.accountCategory).toBe(ACCOUNT_CATEGORIES.general);
      expect(account.currentBalance).toEqual(before.currentBalance);

      const gone = await helpers.getLoanById({ id: accountId, raw: false });
      expect(gone.statusCode).toBe(404);
    });
  });
});
