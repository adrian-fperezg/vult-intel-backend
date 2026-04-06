import dotenv from 'dotenv';
dotenv.config();

export interface AlertPayload {
  environment?: string;
  source: 'Backend' | 'Frontend';
  errorMessage: string;
  stackTrace?: string;
  requestPath?: string;
  userId?: string | null;
  payload?: any;
}

// Prefer Slack, Fallback to Discord, then manual placeholder
const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;

export const sendAlert = async (alert: AlertPayload) => {
  try {
    if (!WEBHOOK_URL || !WEBHOOK_URL.startsWith('http')) {
      console.warn('[Notifier] Webhook URL not configured. (Set SLACK_WEBHOOK_URL in .env)');
      return;
    }

    // Mask sensitive keys
    let safePayload = '';
    if (alert.payload) {
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
      
      try {
        maskObject(masked);
        safePayload = JSON.stringify(masked, null, 2).slice(0, 2000); 
      } catch (e) {
        safePayload = '[Unserializable Payload]';
      }
    }

    // Formatting for Slack Block Kit
    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚨 Vult Intel Forensic Report: ${alert.source} Crash`,
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Environment:*\n${alert.environment || process.env.NODE_ENV || 'production'}` },
          { type: "mrkdwn", text: `*Source:*\n${alert.source}` },
          { type: "mrkdwn", text: `*User ID:*\n${alert.userId || 'Anonymous'}` },
          { type: "mrkdwn", text: `*Request Path:*\n\`${alert.requestPath || 'N/A'}\`` }
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

    const payload = {
      text: `🚨 [Vult Intel] ${alert.source} Crash: ${alert.errorMessage}`,
      blocks
    };

    // Use native fetch (Node 18+)
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Notifier] Slack API Error: ${response.status} - ${errorText}`);
    } else {
      console.log(`[Notifier] forensic alert successfully pushed to Slack.`);
    }
  } catch (error) {
    console.error('Failed to send forensic alert to Slack:', error);
  }
};
