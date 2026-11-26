import createAccountLink from '@controllers/account-links/create-account-link';
import deleteAccountLink from '@controllers/account-links/delete-account-link';
import getAccountLinks from '@controllers/account-links/get-account-links';
import { authenticateSession } from '@middlewares/better-auth';
import { Router } from 'express';

const router = Router({});

router.use(authenticateSession);

router.get('/', getAccountLinks);
router.post('/', createAccountLink);
router.delete('/:id', deleteAccountLink);

export default router;
