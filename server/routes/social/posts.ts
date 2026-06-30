import { Router } from 'express';
import { AuthRequest } from '../../middleware.js';
import db from '../../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /api/social/posts
router.get('/', async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const pId = (req.headers['x-project-id'] as string) || (req.query.project_id as string);
  const { status, from, to } = req.query as Record<string, string>;
  if (!userId || !pId) return res.status(400).json({ error: 'project_id required' });

  try {
    let sql = `
      SELECT p.*, 
        COALESCE(
          json_agg(
            json_build_object(
              'id', t.id, 'account_id', t.account_id, 'platform', t.platform,
              'status', t.status, 'error_message', t.error_message,
              'published_at', t.published_at, 'analytics', t.analytics
            )
          ) FILTER (WHERE t.id IS NOT NULL), '[]'
        ) as targets
      FROM social_posts p
      LEFT JOIN social_post_targets t ON t.post_id = p.id
      WHERE p.project_id = ? AND p.user_id = ?
    `;
    const params: any[] = [pId, userId];

    if (status && status !== 'all') { sql += ` AND p.status = ?`; params.push(status); }
    if (from) { sql += ` AND p.scheduled_at >= ?`; params.push(from); }
    if (to) { sql += ` AND p.scheduled_at <= ?`; params.push(to); }

    sql += ` GROUP BY p.id ORDER BY COALESCE(p.scheduled_at, p.created_at) ASC`;

    const posts = await db.all(sql, ...params);
    res.json(posts);
  } catch (err: any) {
    console.error('[SOCIAL_POSTS] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/social/posts
router.post('/', async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const pId = (req.headers['x-project-id'] as string) || req.body.project_id;
  const { body, media_urls, link_url, link_title, link_description, link_image, scheduled_at, account_ids, status } = req.body;
  if (!userId || !pId) return res.status(400).json({ error: 'project_id required' });
  if (!body?.trim()) return res.status(400).json({ error: 'body is required' });
  if (!account_ids?.length) return res.status(400).json({ error: 'Select at least one account' });

  try {
    const postId = uuidv4();
    const postStatus = scheduled_at ? 'scheduled' : (status || 'draft');

    await db.run(`
      INSERT INTO social_posts (id, project_id, user_id, body, media_urls, link_url, link_title, link_description, link_image, status, scheduled_at)
      VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?)
    `, postId, pId, userId, body, JSON.stringify(media_urls || []), link_url || null, link_title || null, link_description || null, link_image || null, postStatus, scheduled_at || null);

    // Create targets for each account
    for (const accountId of account_ids) {
      const account = await db.get<any>(`SELECT platform FROM social_accounts WHERE id = ?`, accountId);
      if (account) {
        await db.run(`
          INSERT INTO social_post_targets (id, post_id, account_id, platform, status)
          VALUES (?, ?, ?, ?, 'pending')
        `, uuidv4(), postId, accountId, account.platform);
      }
    }

    const post = await db.get<any>(`SELECT * FROM social_posts WHERE id = ?`, postId);
    res.status(201).json(post);
  } catch (err: any) {
    console.error('[SOCIAL_POSTS] POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/social/posts/:id
router.patch('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  const { body, media_urls, link_url, scheduled_at, account_ids, status } = req.body;
  if (!userId) return res.status(401).json({ error: 'Auth required' });

  try {
    const post = await db.get<any>(`SELECT * FROM social_posts WHERE id = ? AND user_id = ?`, id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await db.run(`
      UPDATE social_posts SET
        body = COALESCE(?, body),
        media_urls = COALESCE(?::jsonb, media_urls),
        link_url = COALESCE(?, link_url),
        scheduled_at = ?,
        status = COALESCE(?, status),
        updated_at = NOW()
      WHERE id = ?
    `, body, media_urls ? JSON.stringify(media_urls) : null, link_url, scheduled_at || null, status, id);

    if (account_ids) {
      await db.run(`DELETE FROM social_post_targets WHERE post_id = ? AND status = 'pending'`, id);
      for (const accountId of account_ids) {
        const account = await db.get<any>(`SELECT platform FROM social_accounts WHERE id = ?`, accountId);
        if (account) {
          await db.run(`
            INSERT INTO social_post_targets (id, post_id, account_id, platform, status)
            VALUES (?, ?, ?, ?, 'pending')
            ON CONFLICT DO NOTHING
          `, uuidv4(), id, accountId, account.platform);
        }
      }
    }

    const updated = await db.get<any>(`SELECT * FROM social_posts WHERE id = ?`, id);
    res.json(updated);
  } catch (err: any) {
    console.error('[SOCIAL_POSTS] PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/social/posts/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Auth required' });

  try {
    const post = await db.get<any>(`SELECT * FROM social_posts WHERE id = ? AND user_id = ?`, id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await db.run(`DELETE FROM social_posts WHERE id = ?`, id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/social/posts/:id/publish – immediate publish
router.post('/:id/publish', async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Auth required' });

  try {
    const post = await db.get<any>(`SELECT * FROM social_posts WHERE id = ? AND user_id = ?`, id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status === 'published') return res.status(400).json({ error: 'Already published' });

    // Set to publish immediately (cron will pick it up or we invoke directly)
    await db.run(`UPDATE social_posts SET scheduled_at = NOW(), status = 'scheduled' WHERE id = ?`, id);
    
    // Import and run publisher inline
    const { publishPost } = await import('../../lib/social/publisher.js');
    await publishPost(post.id);

    const updated = await db.get<any>(`SELECT * FROM social_posts WHERE id = ?`, id);
    res.json(updated);
  } catch (err: any) {
    console.error('[SOCIAL_POSTS] Publish error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
