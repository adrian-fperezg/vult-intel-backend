# Gmail Integration Configuration Guide

To ensure the new Gmail synchronization works correctly in production, please update your settings as follows:

## 1. Google Cloud Console
1. Navigate to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials).
2. Edit your **OAuth 2.0 Client ID**.
3. Under **Authorized redirect URIs**, add this exact URL:
   `https://<YOUR_DOMAIN>/api/outreach/auth/google/callback`
   *(Use your local backend URL, e.g., `http://localhost:3001/api/outreach/auth/google/callback`, for local testing).*
4. Under **OAuth Consent Screen**, ensure these scopes are added and enabled:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

## 2. Railway Environment Variables
Update the following variables in your Railway project settings:

| Variable | Value |
| :--- | :--- |
| `FRONTEND_URL` | `https://<YOUR_FRONTEND_DOMAIN>` |
| `GOOGLE_REDIRECT_URI` | `https://<YOUR_BACKEND_DOMAIN>/api/outreach/auth/google/callback` |

> [!IMPORTANT]
> After updating these variables, Railway will redeploy your app. Once deployed, you should reconnect your Gmail account in **Outreach > Settings** to grant the new `gmail.modify` permission.
