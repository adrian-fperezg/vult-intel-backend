import { Router } from 'express';
import accountsRouter from './accounts.js';
import oauthRouter from './oauth.js';
import postsRouter from './posts.js';

const router = Router();

router.use('/auth', oauthRouter);
router.use('/accounts', accountsRouter);
router.use('/posts', postsRouter);

export default router;
