import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  API_ERROR_CODES,
  BANK_PROVIDER_TYPE,
  type RecordId,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { SIMPLEFIN_ACCOUNT_1, getMockedSimplefinAccountSet } from '@tests/mocks/simplefin/data';
import { VALID_SIMPLEFIN_SETUP_TOKEN, getSimplefinAccountsMock } from '@tests/mocks/simplefin/mock-api';

/** A bank-synced account: the only kind loan details can be attached to. */
const createSyncedAccount = async (): Promise<{ accountId: RecordId; connectionId: string }> => {
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
  return { accountId: syncedAccounts[0]!.id as RecordId, connectionId };
};

describe('POST /loans/attach', () => {
  it('adds loan details to a synced account and leaves its balance to the bank', async () => {
    const { accountId } = await createSyncedAccount();
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
    expect(JSON.stringify(result.body)).toContain('bank-synced');
  });

  it('rejects an account that already has loan details', async () => {
    const { accountId } = await createSyncedAccount();
    await helpers.attachLoan({ payload: helpers.buildAttachLoanPayload({ accountId }), raw: true });

    const second = await helpers.attachLoan({
      payload: helpers.buildAttachLoanPayload({ accountId }),
      raw: false,
    });

    expect(second.statusCode).toBe(422);
    expect(JSON.stringify(second.body)).toContain('already has loan details');
  });

  it('returns 404 for an account that is not the caller’s', async () => {
    const result = await helpers.attachLoan({
      payload: helpers.buildAttachLoanPayload({ accountId: generateRandomRecordId() }),
      raw: false,
    });

    expect(result.statusCode).toBe(404);
  });

  it('rejects an invalid loan field', async () => {
    const { accountId } = await createSyncedAccount();

    const result = await helpers.attachLoan({
      payload: helpers.buildAttachLoanPayload({ accountId, interestRate: -1 }),
      raw: false,
    });

    expect(result.statusCode).toBe(422);
  });

  describe('after the account stops being synced', () => {
    // Each of these turns the account into a manual one (type `system`); the loan
    // must keep reading its balance as the bank's last report.
    const ways: Array<[string, (args: { accountId: string; connectionId: string }) => Promise<unknown>]> = [
      [
        'unlinked from the bank',
        ({ accountId }) => helpers.unlinkAccountFromBankConnection({ id: accountId, raw: true }),
      ],
      [
        'archived',
        ({ accountId }) =>
          helpers.updateAccount({ id: accountId, payload: { status: ACCOUNT_STATUSES.archived }, raw: true }),
      ],
      [
        'left behind by a disconnected connection',
        ({ connectionId }) => helpers.bankDataProviders.disconnectProvider({ connectionId, raw: true }),
      ],
    ];

    it.each(ways)('the loan keeps the bank balance and its details when the account is %s', async (_, act) => {
      const synced = await createSyncedAccount();
      const { accountId } = synced;
      await helpers.attachLoan({ payload: helpers.buildAttachLoanPayload({ accountId }), raw: true });
      const before = await helpers.getAccount({ id: accountId, raw: true });

      await act(synced);

      const account = await helpers.getAccount({ id: accountId, raw: true });
      expect(account.accountCategory).toBe(ACCOUNT_CATEGORIES.loan);
      expect(account.currentBalance).toEqual(before.currentBalance);
      const loan = await helpers.getLoanById({ id: accountId, raw: true });
      expect(loan.loanDetails.interestRate).toBe(6);

      // Removing the loan drops the details and keeps the account with its history.
      const removed = await helpers.deleteLoan({ id: accountId, raw: false });
      expect(removed.statusCode).toBe(204);
      const kept = await helpers.getAccount({ id: accountId, raw: true });
      expect(kept.accountCategory).toBe(ACCOUNT_CATEGORIES.general);
      expect(kept.currentBalance).toEqual(before.currentBalance);
    });
  });

  it('takes an ordinary transaction once unlinked: the loan engine does not own the balance', async () => {
    const { accountId } = await createSyncedAccount();
    await helpers.attachLoan({ payload: helpers.buildAttachLoanPayload({ accountId }), raw: true });
    await helpers.unlinkAccountFromBankConnection({ id: accountId, raw: true });
    const before = await helpers.getAccount({ id: accountId, raw: true });

    // A loan the engine owns refuses writes on its account and recomputes from its anchor;
    // an unlinked loan keeps the bank's balance and moves by the transaction like any account.
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const after = await helpers.getAccount({ id: accountId, raw: true });
    expect(Number(after.currentBalance)).toBeCloseTo(Number(before.currentBalance) - 100, 2);
  });

  describe('on an attached loan', () => {
    it('has no balance series, because the engine has no anchor to replay', async () => {
      const { accountId } = await createSyncedAccount();
      await helpers.attachLoan({ payload: helpers.buildAttachLoanPayload({ accountId }), raw: true });

      const series = await helpers.getLoanBalanceHistory({ id: accountId, raw: true });

      expect(series).toEqual([]);
    });

    it('edits the loan details but refuses a balance correction', async () => {
      const { accountId } = await createSyncedAccount();
      await helpers.attachLoan({ payload: helpers.buildAttachLoanPayload({ accountId }), raw: true });

      const edited = await helpers.updateLoan({ id: accountId, payload: { interestRate: 5.5 }, raw: true });
      expect(edited.loanDetails.interestRate).toBe(5.5);

      const correction = await helpers.updateLoan({ id: accountId, payload: { currentBalance: 1_000 }, raw: false });
      expect(correction.statusCode).toBe(422);
    });

    it('removing the loan keeps the synced account and returns it to Uncategorized', async () => {
      const { accountId } = await createSyncedAccount();
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
