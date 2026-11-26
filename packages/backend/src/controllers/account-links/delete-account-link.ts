import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteAccountLink } from '@services/account-links/account-links.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  await deleteAccountLink({ userId: user.id, id: params.id });
  return { statusCode: 204 };
});
