import { ACCOUNT_LINK_RELATIONS } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createAccountLink } from '@services/account-links/account-links.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    fromAccountId: recordId(),
    toAccountId: recordId(),
    relation: z.enum(ACCOUNT_LINK_RELATIONS),
  }),
});

export default createController(schema, async ({ user, body }) => {
  return { statusCode: 201, data: await createAccountLink({ userId: user.id, ...body }) };
});
