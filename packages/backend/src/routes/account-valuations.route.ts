import deleteAccountValuation from '@controllers/account-valuations/delete-account-valuation';
import getAccountValuations from '@controllers/account-valuations/get-account-valuations';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { Router } from 'express';

const router = Router({});

router.use(authenticateSession);

router.get('/', getAccountValuations);
router.delete('/:id', checkBaseCurrencyLock, deleteAccountValuation);

export default router;
