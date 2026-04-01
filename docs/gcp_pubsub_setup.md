# Google Cloud Setup: Gmail Real-time Notifications (Pub/Sub)

Follow these steps to enable event-driven email syncing. This will eliminate the need for polling and drastically reduce your Railway credit usage.

## 1. Enable API
Go to the [Google Cloud Console](https://console.cloud.google.com/) and ensure the following API is enabled for your project:
- **Cloud Pub/Sub API**

## 2. Create a Pub/Sub Topic
1. In the GCP Console, go to **Pub/Sub > Topics**.
2. Click **Create Topic**.
3. **Topic ID**: `gmail-notifications` (or similar).
4. Uncheck "Add a default subscription" (we will create a Push subscription manually).
5. Click **Create Topic**.

## 3. Grant Permissions to Gmail
Gmail needs permission to publish messages to your topic.
1. In the **Topic Details** page for `gmail-notifications`, click on the **Permissions** tab.
2. Click **Add Principal**.
3. **New principals**: `gmail-api-push@system.gserviceaccount.com`
4. **Role**: `Pub/Sub Publisher`
5. Click **Save**.

## 4. Create a Push Subscription
1. Go to **Pub/Sub > Subscriptions**.
2. Click **Create Subscription**.
3. **Subscription ID**: `gmail-push-sub`.
4. **Select a Cloud Pub/Sub topic**: `projects/[YOUR_PROJECT_ID]/topics/gmail-notifications`.
5. **Delivery Type**: Select **Push**.
6. **Endpoint URL**: `https://your-domain.com/api/webhooks/gmail/push`
   - *Note: Replace `your-domain.com` with your Railway app URL.*
7. **Enable Authentication**: (Optional but recommended)
   - Create a Service Account for the push subscription if you want to verify the identity of the sender.
8. Click **Create**.

## 5. Add Environment Variables to Railway
Update your Railway variables with the following:
- `GCP_PROJECT_ID`: Your GCP Project ID.
- `GCP_PUBSUB_TOPIC`: `gmail-notifications`
- `WEBHOOK_SECRET`: A random string (e.g., `openssl rand -base64 32`) to secure your endpoint.

---

### Verification
Once these steps are complete, tell me and I will:
1.  Update the code to call `gmail.users.watch()` when a user connects their Gmail.
2.  Implement the `/api/webhooks/gmail/push` endpoint to receive notification and trigger a sync.
