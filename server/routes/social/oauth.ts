import { Router } from 'express';
import { AuthRequest } from '../../middleware.js';
import db from '../../db.js';
import { encryptToken } from '../../lib/outreach/encrypt.js';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ─── PLATFORM CONFIGS ─────────────────────────────────────────────────────────
const BACKEND_URL = process.env.APP_URL || 'http://localhost:3001';

const PLATFORMS: Record<string, {
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  userInfoUrl?: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}> = {
  linkedin: {
    name: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    scopes: 'openid profile email w_member_social',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
  },
  facebook: {
    name: 'Facebook',
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,picture',
    scopes: 'pages_show_list,pages_read_engagement,pages_manage_posts,public_profile',
    clientIdEnv: 'FACEBOOK_APP_ID',
    clientSecretEnv: 'FACEBOOK_APP_SECRET',
  },
  youtube: {
    name: 'YouTube',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.profile openid',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
  },
  twitter: {
    name: 'Twitter/X',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    userInfoUrl: 'https://api.twitter.com/2/users/me',
    scopes: 'tweet.read tweet.write users.read offline.access',
    clientIdEnv: 'TWITTER_CLIENT_ID',
    clientSecretEnv: 'TWITTER_CLIENT_SECRET',
  },
  tiktok: {
    name: 'TikTok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: 'user.info.basic,video.publish,video.upload',
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
  },
};

// ─── OAUTH INITIATION ─────────────────────────────────────────────────────────
// GET /api/social/auth/:platform?project_id=...&user_id=...
router.get('/:platform', async (req: AuthRequest, res) => {
  const { platform } = req.params;
  const userId = req.user?.uid;
  const pId = (req.headers['x-project-id'] as string) || (req.query.project_id as string);

  const config = PLATFORMS[platform];
  if (!config) return res.status(400).json({ error: `Unknown platform: ${platform}` });
  if (!userId) return res.status(401).json({ error: 'Auth required' });

  const clientId = process.env[config.clientIdEnv];
  if (!clientId) {
    return res.status(503).json({ 
      error: `${config.name} OAuth not configured yet.`,
      setup_required: true,
      env_var: config.clientIdEnv
    });
  }

  const state = Buffer.from(JSON.stringify({ pId, userId, platform })).toString('base64url');
  const redirectUri = `${BACKEND_URL}/api/social/auth/${platform}/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: config.scopes,
    state,
    ...(platform === 'youtube' ? { access_type: 'offline', prompt: 'consent' } : {}),
    ...(platform === 'twitter' ? { code_challenge_method: 'plain', code_challenge: 'challenge' } : {}),
  });

  res.redirect(`${config.authUrl}?${params.toString()}`);
});

// ─── OAUTH CALLBACK ───────────────────────────────────────────────────────────
router.get('/:platform/callback', async (req, res) => {
  const { platform } = req.params;
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/social-studio?tab=accounts&error=${encodeURIComponent(error)}`);
  }

  const config = PLATFORMS[platform];
  if (!config) return res.status(400).send(`Unknown platform: ${platform}`);

  let stateData: { pId: string; userId: string; platform: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch {
    return res.status(400).send('Invalid state');
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) {
    return res.redirect(`${process.env.FRONTEND_URL}/social-studio?tab=accounts&error=not_configured`);
  }

  try {
    const redirectUri = `${BACKEND_URL}/api/social/auth/${platform}/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(platform === 'twitter' ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` } : {}),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        ...(platform === 'twitter' ? { code_verifier: 'challenge' } : {}),
      }).toString(),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Failed to get access token');

    // Get user info
    let accountId = '', username = '', displayName = '', avatarUrl = '', channelId = '';
    
    if (config.userInfoUrl) {
      const headers: Record<string, string> = { Authorization: `Bearer ${tokenData.access_token}` };
      const userRes = await fetch(config.userInfoUrl, { headers });
      const userData = await userRes.json() as any;

      if (platform === 'linkedin') {
        accountId = userData.sub;
        username = userData.email || userData.sub;
        displayName = `${userData.given_name || ''} ${userData.family_name || ''}`.trim();
        avatarUrl = userData.picture || '';
      } else if (platform === 'facebook') {
        accountId = userData.id;
        username = userData.name;
        displayName = userData.name;
        avatarUrl = userData.picture?.data?.url || '';
      } else if (platform === 'youtube') {
        accountId = userData.sub;
        username = userData.email;
        displayName = userData.name;
        avatarUrl = userData.picture || '';
        // Get YouTube channel ID
        try {
          const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
          });
          const chData = await chRes.json() as any;
          channelId = chData.items?.[0]?.id || '';
          if (!displayName) displayName = chData.items?.[0]?.snippet?.title || username;
        } catch { /* channel lookup non-critical */ }
      } else if (platform === 'twitter') {
        accountId = userData.data?.id || userData.id;
        username = `@${userData.data?.username || userData.username}`;
        displayName = userData.data?.name || userData.name;
        avatarUrl = userData.data?.profile_image_url || '';
      } else if (platform === 'tiktok') {
        accountId = userData.data?.user?.open_id || uuidv4();
        username = userData.data?.user?.display_name || 'TikTok User';
        displayName = username;
        avatarUrl = userData.data?.user?.avatar_url || '';
      }
    }

    const expiresAt = tokenData.expires_in 
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Upsert account
    await db.run(`
      INSERT INTO social_accounts 
        (id, project_id, user_id, platform, account_id, username, display_name, avatar_url, 
         access_token, refresh_token, token_expires_at, scopes, channel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (project_id, platform, account_id) DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, social_accounts.refresh_token),
        token_expires_at = EXCLUDED.token_expires_at,
        scopes = EXCLUDED.scopes,
        channel_id = EXCLUDED.channel_id,
        updated_at = NOW()
    `,
      uuidv4(),
      stateData.pId,
      stateData.userId,
      platform,
      accountId,
      username,
      displayName,
      avatarUrl,
      encryptToken(tokenData.access_token),
      tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
      expiresAt?.toISOString() || null,
      config.scopes,
      channelId || null
    );

    res.redirect(`${process.env.FRONTEND_URL}/social-studio?tab=accounts&connected=${platform}`);
  } catch (err: any) {
    console.error(`[SOCIAL_OAUTH] ${platform} error:`, err.message);
    res.redirect(`${process.env.FRONTEND_URL}/social-studio?tab=accounts&error=${encodeURIComponent(err.message)}`);
  }
});

export default router;
