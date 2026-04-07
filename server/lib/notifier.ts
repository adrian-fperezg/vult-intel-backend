import dotenv from 'dotenv';
dotenv.config();

export interface AlertPayload {
  environment?: string;
  source: 'Backend' | 'Frontend';
  errorMessage: string;
  stackTrace?: string;
  requestPath?: string;
  userId?: string | null;
  projectId?: string;
  payload?: any;
  customTitle?: string;
}

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export const sendAlert = async (alert: AlertPayload) => {
  try {
    if (!WEBHOOK_URL || !WEBHOOK_URL.startsWith('http')) {
      console.warn('[Notifier] Webhook URL not configured. (Set SLACK_WEBHOOK_URL in .env)');
      return;
    }

    // Mask sensitive keys
    let safePayload = '';
    if (alert.payload) {
      try {
        const masked = JSON.parse(JSON.stringify(alert.payload)); // deep copy
        const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'key', 'credit_card', 'card'];
        
        const maskObject = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          for (const k in obj) {
            if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk))) {
              obj[k] = '***MASKED***';
            } else if (typeof obj[k] === 'object') {
              maskObject(obj[k]);
            }
          }
        };
        
        maskObject(masked);
        safePayload = JSON.stringify(masked, null, 2).slice(0, 2000); 
      } catch (e) {
        safePayload = '[Unserializable Payload]';
      }
    }

    const title = alert.customTitle || `🚨 Vult Intel Forensic Report: ${alert.source} Crash`;
    const timestamp = new Date().toLocaleString();

    // Formatting for Slack Block Kit
    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title.length > 3000 ? title.substring(0, 2997) + '...' : title,
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Environment:*\n${alert.environment || process.env.NODE_ENV || 'production'}` },
          { type: "mrkdwn", text: `*Source:*\n${alert.source}` },
          { type: "mrkdwn", text: `*User ID:*\n${alert.userId || 'Anonymous'}` },
          { type: "mrkdwn", text: `*Request Path:*\n\`${alert.requestPath || 'N/A'}\`` },
          { type: "mrkdwn", text: `*Project ID:*\n${alert.projectId || 'N/A'}` },
          { type: "mrkdwn", text: `*Timestamp:*\n${timestamp}` }
        ]
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error Message:*\n> ${alert.errorMessage}`
        }
      }
    ];

    if (alert.stackTrace) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Stack Trace:*\n\`\`\`${alert.stackTrace.slice(0, 2000)}\`\`\``
        }
      });
    }

    if (safePayload && safePayload !== '{}') {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Context Payload:*\n\`\`\`json\n${safePayload}\n\`\`\``
        }
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "🔐 *Vult Intel Forensic Monitoring System*"
        }
      ]
    });

    const slackPayload = {
      text: `${title}: ${alert.errorMessage}`, // Fallback
      blocks
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Notifier] Slack API Error: ${response.status} - ${errorText}`);
    } else {
      console.log(`[Notifier] Forensic alert sent: ${title}`);
    }
  } catch (error) {
    console.error('[Notifier] Failed to send forensic alert to Slack:', error);
  }
};
