import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getAccountValuations } from '@services/account-valuations/account-valuations.service';
import { z } from 'zod';

const schema = z.object({
  query: z.object({ accountId: recordId() }),
});

export default createController(schema, async ({ user, query }) => {
  return { data: await getAccountValuations({ userId: user.id, accountId: query.accountId }) };
});
