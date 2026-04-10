export interface AnalyticsData {
  total_sent: number;
  sent_change: string;
  open_rate: string;
  /** Percentage-point change in open rate vs previous period. null = no previous data. */
  open_rate_change: number | null;
  reply_rate: string;
  /** Percentage-point change in reply rate vs previous period. null = no previous data. */
  reply_rate_change: number | null;
  bounce_rate?: string;
  /** Percentage-point change in bounce rate vs previous period. null = no previous data. */
  bounce_rate_change: number | null;
  active_sequences: number;
  total_recipients: number;
  pending_tasks: number;
  emails_sent_today: number;
  health_score: number;
  mailbox_health: {
    email: string;
    score: number;
    status: string;
    sent: number;
    bounceRate: number;
    spamRate: number;
  }[];
  daily_data: { 
    day: string; 
    sent: number; 
    opens: number; 
    replies: number; 
    clicks?: number;
    bounced?: number;
  }[];
  intent_data: {
    name: string;
    value: number;
    color: string;
  }[];
  campaign_comparison: {
    name: string;
    sent: number;
    open: string;
    reply: string;
    bounce: string;
  }[];
}

export interface FunnelStat {
  funnel_stage: string;
  campaign_count: number;
  total_sent: number;
  total_opens: number;
  total_replies: number;
  total_bounces: number;
}

export interface AiReportResponse {
  report: string;
  timestamp: string;
}
