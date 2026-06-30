import { Router } from 'express';
import { AuthRequest } from '../../middleware.js';
import db from '../../db.js';

const router = Router();

// GET /api/social/accounts - list connected accounts for project
router.get('/', async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const pId = (req.headers['x-project-id'] as string) || (req.query.project_id as string);
  if (!userId) return res.status(401).json({ error: 'Auth required' });
  if (!pId) return res.status(400).json({ error: 'project_id required' });

  try {
    const accounts = await db.all(`
      SELECT id, platform, account_id, username, display_name, avatar_url, 
             token_expires_at, scopes, page_id, channel_id, created_at
      FROM social_accounts 
      WHERE project_id = ? AND user_id = ?
      ORDER BY platform, created_at ASC
    `, pId, userId);
    res.json(accounts);
  } catch (err: any) {
    console.error('[SOCIAL_ACCOUNTS] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/social/accounts/:id - disconnect an account
router.delete('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const pId = (req.headers['x-project-id'] as string) || (req.query.project_id as string);
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Auth required' });

  try {
    const account = await db.get<any>(`SELECT * FROM social_accounts WHERE id = ? AND user_id = ?`, id, userId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    await db.run(`DELETE FROM social_accounts WHERE id = ?`, id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[SOCIAL_ACCOUNTS] DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
