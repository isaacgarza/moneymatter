import createAccountLink from '@controllers/account-links/create-account-link';
import deleteAccountLink from '@controllers/account-links/delete-account-link';
import getAccountLinks from '@controllers/account-links/get-account-links';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { Router } from 'express';

const router = Router({});

router.use(authenticateSession);

router.get('/', getAccountLinks);
router.post('/', checkBaseCurrencyLock, createAccountLink);
router.delete('/:id', checkBaseCurrencyLock, deleteAccountLink);

export default router;
