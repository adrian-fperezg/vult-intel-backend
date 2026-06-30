/**
 * Social Studio Publisher
 * Publishes a social_post to all its pending targets.
 * Called by the cron scheduler and by the "Post Now" endpoint.
 */
import db from '../../db.js';
import { decryptToken } from '../outreach/encrypt.js';
import fetch from 'node-fetch';
import FormData from 'form-data';

// ─── PLATFORM PUBLISHERS ──────────────────────────────────────────────────────

async function publishToLinkedIn(account: any, post: any): Promise<string> {
  const token = decryptToken(account.access_token);
  const body: any = {
    author: `urn:li:person:${account.account_id}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: post.body },
        shareMediaCategory: post.link_url ? 'ARTICLE' : 'NONE',
        ...(post.link_url ? {
          media: [{
            status: 'READY',
            originalUrl: post.link_url,
            title: { text: post.link_title || post.link_url },
            description: { text: post.link_description || '' },
          }]
        } : {})
      }
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  };

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data.id || 'linkedin_post';
}

async function publishToFacebook(account: any, post: any): Promise<string> {
  const token = decryptToken(account.access_token);
  const pageId = account.page_id || account.account_id;

  const body: any = { message: post.body, access_token: token };
  if (post.link_url) body.link = post.link_url;

  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message);
  return data.id || 'fb_post';
}

async function publishToYouTube(account: any, post: any): Promise<string> {
  const token = decryptToken(account.access_token);
  // For community posts (text)
  const res = await fetch('https://www.googleapis.com/youtube/v3/communityPosts?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snippet: { postType: 'textPost', textOriginalPost: { text: post.body } }
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  return data.id || 'yt_post';
}

async function publishToTwitter(account: any, post: any): Promise<string> {
  const token = decryptToken(account.access_token);
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: post.body.slice(0, 280) }),
  });
  const data = await res.json() as any;
  if (data.errors || data.error) throw new Error(data.errors?.[0]?.message || data.detail || 'Twitter error');
  return data.data?.id || 'tweet';
}

async function publishToTikTok(account: any, post: any): Promise<string> {
  const token = decryptToken(account.access_token);
  // TikTok requires video — for text we skip gracefully
  throw new Error('TikTok requires a video. Upload a video file to publish to TikTok.');
}

// ─── PLATFORM DISPATCH ────────────────────────────────────────────────────────
async function publishToAccount(account: any, post: any): Promise<string> {
  switch (account.platform) {
    case 'linkedin':  return publishToLinkedIn(account, post);
    case 'facebook':  return publishToFacebook(account, post);
    case 'instagram': return publishToFacebook(account, post); // Instagram via Graph API uses same endpoint via page
    case 'youtube':   return publishToYouTube(account, post);
    case 'twitter':   return publishToTwitter(account, post);
    case 'tiktok':    return publishToTikTok(account, post);
    default:          throw new Error(`Unsupported platform: ${account.platform}`);
  }
}

// ─── MAIN PUBLISH FUNCTION ────────────────────────────────────────────────────
export async function publishPost(postId: string): Promise<void> {
  const post = await db.get<any>(`SELECT * FROM social_posts WHERE id = ?`, postId);
  if (!post) return;

  const targets = await db.all<any>(`
    SELECT t.*, a.access_token, a.refresh_token, a.account_id, a.page_id, a.channel_id, a.username
    FROM social_post_targets t
    JOIN social_accounts a ON a.id = t.account_id
    WHERE t.post_id = ? AND t.status = 'pending'
  `, postId);

  if (!targets.length) {
    await db.run(`UPDATE social_posts SET status = 'published', published_at = NOW() WHERE id = ?`, postId);
    return;
  }

  await db.run(`UPDATE social_posts SET status = 'publishing' WHERE id = ?`, postId);

  let allPublished = true;
  for (const target of targets) {
    try {
      const platformPostId = await publishToAccount(target, post);
      await db.run(`
        UPDATE social_post_targets SET status = 'published', platform_post_id = ?, published_at = NOW() WHERE id = ?
      `, platformPostId, target.id);
    } catch (err: any) {
      console.error(`[SOCIAL_PUBLISHER] ${target.platform} failed:`, err.message);
      await db.run(`UPDATE social_post_targets SET status = 'failed', error_message = ? WHERE id = ?`, err.message, target.id);
      allPublished = false;
    }
  }

  const newStatus = allPublished ? 'published' : 'failed';
  await db.run(`
    UPDATE social_posts SET status = ?, published_at = ${allPublished ? 'NOW()' : 'NULL'} WHERE id = ?
  `, newStatus, postId);
}

// ─── CRON SCHEDULER ───────────────────────────────────────────────────────────
export async function runSocialPublisherCron(): Promise<void> {
  try {
    const duePosts = await db.all<any>(`
      SELECT id FROM social_posts 
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 20
    `);

    for (const post of duePosts) {
      await publishPost(post.id).catch(err => 
        console.error('[SOCIAL_CRON] publish error for post', post.id, err.message)
      );
    }
  } catch (err: any) {
    console.error('[SOCIAL_CRON] error:', err.message);
  }
}
