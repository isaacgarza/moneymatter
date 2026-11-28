import { createController } from '@controllers/helpers/controller-factory';
import { attachLoan } from '@services/loans/attach-loan.service';
import { toLoanView } from '@services/loans/get-loan-views.service';
import { attachLoanBodySchema } from '@services/loans/zod-schemas';
import { z } from 'zod';

const schema = z.object({
  body: attachLoanBodySchema,
});

export default createController(schema, async ({ user, body }) => {
  const loanDetails = await attachLoan({ userId: user.id, ...body });

  // Payments only exist for a loan the engine manages, and a synced loan is not one.
  return { data: await toLoanView({ userId: user.id, loanDetails, paymentsCount: 0 }), statusCode: 201 };
});
