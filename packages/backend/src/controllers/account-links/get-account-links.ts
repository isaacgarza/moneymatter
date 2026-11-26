import { createController } from '@controllers/helpers/controller-factory';
import { getAccountLinks } from '@services/account-links/account-links.service';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  return { data: await getAccountLinks({ userId: user.id }) };
});
