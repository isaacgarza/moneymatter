import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteAccountValuation } from '@services/account-valuations/account-valuations.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  await deleteAccountValuation({ userId: user.id, id: params.id });
  return { statusCode: 204 };
});
