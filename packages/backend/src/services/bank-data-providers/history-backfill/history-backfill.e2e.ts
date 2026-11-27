import { BANK_HISTORY_STATE, BANK_PROVIDER_TYPE, TRANSACTION_TYPES } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Transactions from '@models/transactions.model';
import { runBankHistoryBackfill } from '@root/crons/bank-history-backfill';
import { redisClient } from '@root/redis-client';
import * as helpers from '@tests/helpers';
import {
  SIMPLEFIN_ACCOUNT_1,
  SIMPLEFIN_ACCOUNT_2,
  getMockedSimplefinAccountSet,
  getMockedSimplefinTransactionsOnDaysAgo,
} from '@tests/mocks/simplefin/data';
import {
  INVALID_SIMPLEFIN_SETUP_TOKEN,
  SIMPLEFIN_ACCOUNTS_URL,
  VALID_SIMPLEFIN_SETUP_TOKEN,
  createSimplefinAccountsRecorder,
  getSimplefinAccountsErrorMock,
  getSimplefinAccountsMock,
} from '@tests/mocks/simplefin/mock-api';
import { addHours, subDays } from 'date-fns';
import { HttpResponse, http } from 'msw';
import { Op } from 'sequelize';

import { formatDay } from './plan-windows';

/** The cron has no HTTP surface, so these e2e tests invoke it directly, as bank-accounts-sync.e2e.ts does. */

const connectSimplefin = async (): Promise<string> => {
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
    credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
    raw: true,
  });
  return connectionId;
};

const importAccounts = async ({
  connectionId,
  externalIds = [SIMPLEFIN_ACCOUNT_1],
}: {
  connectionId: string;
  externalIds?: string[];
}): Promise<string[]> => {
  const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: externalIds,
    raw: true,
  });
  return syncedAccounts.map((account) => account.id);
};

const daysAgoAsDay = ({ days }: { days: number }): string => formatDay({ date: subDays(new Date(), days) });

const setStartDate = ({ connectionId, daysAgo }: { connectionId: string; daysAgo: number }) =>
  helpers.bankDataProviders.updateConnectionDetails({
    connectionId,
    historyStartDate: daysAgoAsDay({ days: daysAgo }),
    raw: true,
  });

const getHistory = async ({ connectionId }: { connectionId: string }) =>
  (await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true })).connection.history;

/** Transactions older than the first sync's 180 days, so only the history load reaches them. */
const olderTransactions = () => getMockedSimplefinTransactionsOnDaysAgo([190, 230, 265]);

const requestStartDates = ({ requests }: { requests: URL[] }): number[] =>
  requests.map((url) => Number(url.searchParams.get('start-date')));

/** A connection with one imported account and a recorder that serves `transactions` by window. */
const setUp = async ({
  transactions = olderTransactions(),
}: { transactions?: ReturnType<typeof olderTransactions> } = {}) => {
  const connectionId = await connectSimplefin();
  const [accountId] = await importAccounts({ connectionId });
  const recorder = createSimplefinAccountsRecorder({ account1Transactions: transactions, windowed: true });
  global.mswMockServer.use(recorder.handler);
  return { connectionId, accountId: accountId!, recorder };
};

afterEach(() => {
  delete process.env.BANK_HISTORY_DAILY_REQUESTS;
});

describe('Bank history backfill', () => {
  describe('loading', () => {
    it('loads one window per run, newest first, and completes at the start date', async () => {
      const { connectionId, accountId, recorder } = await setUp();
      await setStartDate({ connectionId, daysAgo: 270 });

      expect(await getHistory({ connectionId })).toMatchObject({ state: BANK_HISTORY_STATE.pending });

      expect((await runBankHistoryBackfill()).loaded).toBe(1);
      expect(await Transactions.count({ where: { accountId } })).toBe(1);
      expect(await getHistory({ connectionId })).toMatchObject({
        state: BANK_HISTORY_STATE.running,
        windowsDone: 1,
        windowsTotal: 3,
      });

      await runBankHistoryBackfill();
      expect(await Transactions.count({ where: { accountId } })).toBe(3);

      expect((await runBankHistoryBackfill()).complete).toBe(1);
      expect(await getHistory({ connectionId })).toMatchObject({
        state: BANK_HISTORY_STATE.complete,
        windowsDone: 3,
        windowsTotal: 3,
        nextRunAt: null,
      });

      const starts = requestStartDates({ requests: recorder.requests });
      expect(starts).toHaveLength(3);
      expect(starts).toEqual(starts.toSorted((a, b) => b - a));
    });

    it('stores each transaction once and does nothing further after completion', async () => {
      const { connectionId, accountId, recorder } = await setUp();
      await setStartDate({ connectionId, daysAgo: 270 });

      for (let run = 0; run < 3; run++) await runBankHistoryBackfill();
      const requestsAfterCompletion = recorder.requests.length;
      const result = await runBankHistoryBackfill();

      expect(result.connectionsDue).toBe(0);
      expect(recorder.requests).toHaveLength(requestsAfterCompletion);
      expect(await Transactions.count({ where: { accountId } })).toBe(3);
    });

    it('costs one request per window however many accounts the connection has', async () => {
      const connectionId = await connectSimplefin();
      await importAccounts({ connectionId, externalIds: [SIMPLEFIN_ACCOUNT_1, SIMPLEFIN_ACCOUNT_2] });
      const recorder = createSimplefinAccountsRecorder({ account1Transactions: olderTransactions(), windowed: true });
      global.mswMockServer.use(recorder.handler);
      await setStartDate({ connectionId, daysAgo: 270 });

      for (let run = 0; run < 3; run++) await runBankHistoryBackfill();

      expect(recorder.requests).toHaveLength(3);
    });

    it('does nothing for a connection without a start date', async () => {
      const { recorder } = await setUp();

      const result = await runBankHistoryBackfill();

      expect(result.connectionsDue).toBe(0);
      expect(recorder.requests).toHaveLength(0);
    });

    it('starts a connection from the connect flow when a start date is passed', async () => {
      const connectionId = await connectSimplefin();
      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_1],
        historyStartDate: daysAgoAsDay({ days: 270 }),
        raw: true,
      });

      expect(await getHistory({ connectionId })).toMatchObject({
        startDate: daysAgoAsDay({ days: 270 }),
        state: BANK_HISTORY_STATE.pending,
      });
    });
  });

  describe('changing the start date', () => {
    it('stops without deleting what was loaded when the date is cleared', async () => {
      const { connectionId, accountId, recorder } = await setUp();
      await setStartDate({ connectionId, daysAgo: 270 });
      await runBankHistoryBackfill();
      expect(await Transactions.count({ where: { accountId } })).toBe(1);

      await helpers.bankDataProviders.updateConnectionDetails({ connectionId, historyStartDate: null, raw: true });
      const requestsBefore = recorder.requests.length;
      await runBankHistoryBackfill();

      expect(await getHistory({ connectionId })).toBeNull();
      expect(recorder.requests).toHaveLength(requestsBefore);
      expect(await Transactions.count({ where: { accountId } })).toBe(1);
    });

    it('continues further back when the date moves earlier after completion', async () => {
      const { connectionId, accountId } = await setUp({
        transactions: getMockedSimplefinTransactionsOnDaysAgo([190, 300]),
      });
      await setStartDate({ connectionId, daysAgo: 224 });
      await runBankHistoryBackfill();
      await runBankHistoryBackfill();
      expect((await getHistory({ connectionId }))?.state).toBe(BANK_HISTORY_STATE.complete);

      await setStartDate({ connectionId, daysAgo: 312 });
      expect((await getHistory({ connectionId }))?.state).toBe(BANK_HISTORY_STATE.running);

      for (let run = 0; run < 3; run++) await runBankHistoryBackfill();

      expect(await Transactions.count({ where: { accountId } })).toBe(2);
      expect((await getHistory({ connectionId }))?.state).toBe(BANK_HISTORY_STATE.complete);
    });

    it('completes without a request when the date is newer than the history already loaded', async () => {
      const { connectionId, recorder } = await setUp();
      await setStartDate({ connectionId, daysAgo: 100 });

      await runBankHistoryBackfill();

      expect(recorder.requests).toHaveLength(0);
      expect((await getHistory({ connectionId }))?.state).toBe(BANK_HISTORY_STATE.complete);
    });
  });

  describe('request budget and failures', () => {
    it('spends no more than the daily cap and resumes once a request ages out', async () => {
      process.env.BANK_HISTORY_DAILY_REQUESTS = '1';
      const { connectionId, recorder } = await setUp();
      await setStartDate({ connectionId, daysAgo: 270 });
      const now = new Date();

      await runBankHistoryBackfill({ now });
      const second = await runBankHistoryBackfill({ now });

      expect(second.budget).toBe(1);
      expect(recorder.requests).toHaveLength(1);
      expect((await getHistory({ connectionId }))?.nextRunAt).toBe(addHours(now, 24).toISOString());

      await runBankHistoryBackfill({ now: addHours(now, 25) });
      expect(recorder.requests).toHaveLength(2);
    });

    it('backs off for a day when the bridge rate-limits, and keeps the cursor', async () => {
      const { connectionId } = await setUp();
      await setStartDate({ connectionId, daysAgo: 270 });
      const requests: URL[] = [];
      global.mswMockServer.use(
        http.get(SIMPLEFIN_ACCOUNTS_URL, ({ request }) => {
          requests.push(new URL(request.url));
          return new HttpResponse(null, { status: 429, statusText: 'Too Many Requests' });
        }),
      );
      const now = new Date();

      expect((await runBankHistoryBackfill({ now })).cooldown).toBe(1);
      expect(await getHistory({ connectionId })).toMatchObject({
        state: BANK_HISTORY_STATE.cooldown,
        windowsDone: 0,
        nextRunAt: addHours(now, 24).toISOString(),
      });

      await runBankHistoryBackfill({ now: addHours(now, 1) });
      expect(requests).toHaveLength(1);

      await runBankHistoryBackfill({ now: addHours(now, 25) });
      expect(requests).toHaveLength(2);
    });

    it('retries a failing window, then gives up on it and carries on with the older ones', async () => {
      const { connectionId } = await setUp();
      await setStartDate({ connectionId, daysAgo: 270 });
      global.mswMockServer.use(getSimplefinAccountsErrorMock({ status: 500 }));

      for (let run = 1; run <= 4; run++) {
        expect((await runBankHistoryBackfill()).failed).toBe(1);
        expect((await getHistory({ connectionId }))?.windowsDone).toBe(0);
      }
      await runBankHistoryBackfill();

      // The newest window is given up on and the older ones are still to load, so it is not yet "attention".
      const history = await getHistory({ connectionId });
      expect(history?.state).toBe(BANK_HISTORY_STATE.running);
      expect(history?.windowsDone).toBe(1);
      expect(history?.lastError).toBeTruthy();
    });

    it('flags the connection once loading finishes with a window given up on, and retries it when the date is saved again', async () => {
      const { connectionId, accountId } = await setUp();
      // 224 days back is exactly one window below the first sync's reach, so giving it up finishes the load.
      await setStartDate({ connectionId, daysAgo: 224 });
      global.mswMockServer.use(getSimplefinAccountsErrorMock({ status: 500 }));
      for (let run = 0; run < 5; run++) await runBankHistoryBackfill();
      expect((await getHistory({ connectionId }))?.state).toBe(BANK_HISTORY_STATE.attention);

      const recorder = createSimplefinAccountsRecorder({ account1Transactions: olderTransactions(), windowed: true });
      global.mswMockServer.use(recorder.handler);
      await setStartDate({ connectionId, daysAgo: 224 });
      expect((await getHistory({ connectionId }))?.state).toBe(BANK_HISTORY_STATE.running);

      await runBankHistoryBackfill();

      // Only the window that was given up on is fetched again.
      expect(recorder.requests).toHaveLength(1);
      expect(await Transactions.count({ where: { accountId } })).toBe(1);
      expect((await getHistory({ connectionId }))?.state).toBe(BANK_HISTORY_STATE.complete);
    });

    it('keeps the cursor still when an account could not store a window', async () => {
      const connectionId = await connectSimplefin();
      await importAccounts({ connectionId, externalIds: [SIMPLEFIN_ACCOUNT_1, SIMPLEFIN_ACCOUNT_2] });
      const accountSet = getMockedSimplefinAccountSet();
      // The bridge answers without the second account, which the sync reports as a failure for that account.
      global.mswMockServer.use(
        getSimplefinAccountsMock({
          response: { ...accountSet, accounts: accountSet.accounts.filter((a) => a.id === SIMPLEFIN_ACCOUNT_1) },
        }),
      );
      await setStartDate({ connectionId, daysAgo: 270 });

      expect((await runBankHistoryBackfill()).failed).toBe(1);

      expect(await getHistory({ connectionId })).toMatchObject({
        state: BANK_HISTORY_STATE.running,
        windowsDone: 0,
        windowsTotal: 3,
        lastError: expect.any(String),
      });
    });

    it('makes no request while a sync holds the account, and does not count one', async () => {
      const { connectionId, accountId, recorder } = await setUp();
      await setStartDate({ connectionId, daysAgo: 270 });
      await redisClient.set(`bank-sync:account:${accountId}`, 'held', 'EX', 60);

      const blocked = await runBankHistoryBackfill();
      await redisClient.del(`bank-sync:account:${accountId}`);

      expect(blocked.locked).toBe(1);
      expect(recorder.requests).toHaveLength(0);
      expect((await getHistory({ connectionId }))?.nextRunAt).toBeNull();

      expect((await runBankHistoryBackfill()).loaded).toBe(1);
    });
  });

  describe('accounts linked after the start date', () => {
    it('loads history that predates the link and keeps the balance equal to the bank', async () => {
      await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
      const manualAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Manual checking', currencyCode: 'USD', initialBalance: 1000 }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: manualAccount.id,
          amount: 40,
          transactionType: TRANSACTION_TYPES.expense,
          time: subDays(new Date(), 400).toISOString(),
        }),
        raw: true,
      });
      const connectionId = await connectSimplefin();
      const recorder = createSimplefinAccountsRecorder({ account1Transactions: olderTransactions(), windowed: true });
      global.mswMockServer.use(recorder.handler);
      await helpers.linkAccountToBankConnection({
        id: manualAccount.id,
        connectionId,
        externalAccountId: SIMPLEFIN_ACCOUNT_1,
        raw: true,
      });
      await helpers.bankDataProviders.waitForAccountsSyncToSettle();
      const bankBalance = Number((await helpers.getAccount({ id: manualAccount.id, raw: true })).currentBalance);

      await setStartDate({ connectionId, daysAgo: 270 });
      for (let run = 0; run < 3; run++) await runBankHistoryBackfill();

      expect(await getHistory({ connectionId })).toMatchObject({
        state: BANK_HISTORY_STATE.complete,
        windowsDone: 3,
        windowsTotal: 3,
      });
      expect(await Transactions.count({ where: { accountId: manualAccount.id, originalId: { [Op.ne]: null } } })).toBe(
        3,
      );

      // The bank owns the balance: loading older rows moves the opening balance, never the current one.
      const account = await helpers.getAccount({ id: manualAccount.id, raw: true });
      const rows = await Transactions.findAll({ where: { accountId: manualAccount.id } });
      const signedSum = rows.reduce(
        (sum, row) => sum + (row.transactionType === TRANSACTION_TYPES.income ? 1 : -1) * row.amount.toNumber(),
        0,
      );
      expect(Number(account.currentBalance)).toBeCloseTo(bankBalance, 2);
      expect(Number(account.initialBalance) + signedSum).toBeCloseTo(bankBalance, 2);
    });
  });

  describe('settings', () => {
    it('rejects a date in the future, before 2000, or that is not a calendar day', async () => {
      const { connectionId } = await setUp();

      const future = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        historyStartDate: formatDay({ date: addHours(new Date(), 48) }),
      });
      const tooEarly = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        historyStartDate: '1999-12-31',
      });
      const notADay = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        historyStartDate: '2025-02-30',
      });

      expect(future.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(tooEarly.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(notADay.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(await getHistory({ connectionId })).toBeNull();
    });

    it('leaves no history load behind when the same request fails its credential check', async () => {
      const { connectionId } = await setUp();

      const response = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        credentials: { setupToken: INVALID_SIMPLEFIN_SETUP_TOKEN },
        historyStartDate: daysAgoAsDay({ days: 270 }),
      });

      expect(response.statusCode).not.toBe(200);
      expect(await getHistory({ connectionId })).toBeNull();
    });

    it('leaves no history load behind when connecting the accounts fails', async () => {
      const connectionId = await connectSimplefin();

      const response = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: ['not-an-account-of-this-bridge'],
        historyStartDate: daysAgoAsDay({ days: 270 }),
        waitForSync: false,
      });

      expect(response.statusCode).not.toBe(200);
      expect(await getHistory({ connectionId })).toBeNull();
    });

    it('reports support only for providers that can load history, and rejects the date for the rest', async () => {
      const { connectionId } = await setUp();
      const simplefin = (await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true })).connection;
      expect(simplefin.supportsHistoryBackfill).toBe(true);

      const { connectionId: lunchflowConnectionId } = await helpers.lunchflow.pair();
      const lunchflow = (
        await helpers.bankDataProviders.getConnectionDetails({ connectionId: lunchflowConnectionId, raw: true })
      ).connection;
      const response = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId: lunchflowConnectionId,
        historyStartDate: daysAgoAsDay({ days: 100 }),
      });

      expect(lunchflow.supportsHistoryBackfill).toBe(false);
      expect(lunchflow.history).toBeNull();
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it("does not let another user read or change a connection's history load", async () => {
      const { connectionId } = await setUp();
      await setStartDate({ connectionId, daysAgo: 270 });
      const otherUser = await helpers.provisionSecondUserWithBaseCurrency();

      await helpers.asUser({
        cookies: otherUser.cookies,
        fn: async () => {
          const change = await helpers.bankDataProviders.updateConnectionDetails({
            connectionId,
            historyStartDate: null,
          });
          const read = await helpers.bankDataProviders.getConnectionDetails({ connectionId });

          expect(change.statusCode).toBe(ERROR_CODES.NotFoundError);
          expect(read.statusCode).toBe(ERROR_CODES.NotFoundError);
        },
      });

      expect(await getHistory({ connectionId })).not.toBeNull();
    });
  });
});
