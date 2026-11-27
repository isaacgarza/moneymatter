import { recordId } from '@common/lib/zod/custom-types';
import { Money } from '@common/types/money';
import { transactionTimeSchema } from '@controllers/transactions.controller/schemas';
import { adjustAccountBalance } from '@services/accounts/balance-adjustment';
import { z } from 'zod';

import { defineTool } from '../define-tool';

export const adjustAccountBalanceTool = defineTool({
  name: 'adjust_account_balance',
  toolset: 'core',
  access: 'write',
  description:
    'Set an account to a specific balance by creating an adjustment transaction for the difference. Returns the previous balance, new balance, and the generated transaction (null if the balance was already at the target). For a vehicle, no transaction is created: the value is recorded as a valuation on the given date and depreciation continues from it, so transaction is null and newBalance is the depreciated value today.',
  input: {
    accountId: recordId().describe('ID of the account to adjust.'),
    newBalance: z
      .number()
      .describe('Target balance as a decimal (e.g. 1500.00). An adjustment transaction is created for the diff.'),
    note: z.string().max(1000).optional().describe('Optional note to attach to the adjustment transaction.'),
    time: transactionTimeSchema().optional().describe('ISO 8601 date the adjustment is recorded against. Default: now'),
  },
  run: async ({ userId, args }) => {
    const result = await adjustAccountBalance({
      userId,
      accountId: args.accountId,
      targetBalance: Money.fromDecimal(args.newBalance),
      note: args.note,
      time: args.time ? new Date(args.time) : undefined,
    });

    return {
      previousBalance: result.previousBalance,
      newBalance: result.newBalance,
      transaction: result.transaction,
    };
  },
});
