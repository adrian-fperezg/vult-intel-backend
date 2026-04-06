import fetch from 'node-fetch';

export interface AlertPayload {
  environment?: string;
  source: 'Backend' | 'Frontend';
  errorMessage: string;
  stackTrace?: string;
  requestPath?: string;
  userId?: string | null;
  payload?: any;
}

// User placeholder from prompt
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || '[PEGA_AQUÍ_TU_URL_DE_DISCORD_O_SLACK]';

export const sendAlert = async (alert: AlertPayload) => {
  try {
    if (!WEBHOOK_URL.startsWith('http')) {
      console.warn('[Notifier] Webhook URL not configured. Would have sent:', alert.errorMessage);
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
        safePayload = JSON.stringify(masked, null, 2).slice(0, 1000); // Top 1000 chars to avoid Discord limits
      } catch (e) {
        safePayload = '[Unserializable Payload]';
      }
    }

    const embed = {
      title: `🚨 [Vult Intel] ${alert.source} Crash`,
      color: alert.source === 'Backend' ? 0xff0000 : 0xffa500, // Red for Backend, Orange for Frontend
      fields: [
        { name: 'Environment', value: alert.environment || process.env.NODE_ENV || 'production', inline: true },
        { name: 'Source', value: alert.source, inline: true },
        { name: 'User ID', value: alert.userId ? String(alert.userId) : 'Anonymous', inline: true },
        { name: 'Request Path', value: alert.requestPath || 'N/A', inline: false },
        { name: 'Error Message', value: alert.errorMessage ? alert.errorMessage.slice(0, 1000) : 'Unknown', inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    if (alert.stackTrace) {
      embed.fields.push({
        name: 'Stack Trace',
        value: `\`\`\`\n${alert.stackTrace.slice(0, 1000)}\n\`\`\``,
        inline: false
      });
    }

    if (safePayload) {
      embed.fields.push({
        name: 'Payload',
        value: `\`\`\`json\n${safePayload}\n\`\`\``,
        inline: false
      });
    }

    const body = {
      username: 'Vult Intel Forensics',
      embeds: [embed]
    };

    // Note: Node 18+ has global fetch, otherwise falling back
    const fetchToUse = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
    
    await fetchToUse(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error('Failed to send forensic alert:', error);
  }
};
