export interface AnalyticsData {
  total_sent: number;
  sent_change: string;
  open_rate: string;
  reply_rate: string;
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
    clicks?: number 
  }[];
  intent_data: {
    name: string;
    value: number;
    color: string;
  }[];
  campaign_comparison: {
    name: string;
    sent: number;
    open: number;
    reply: number;
  }[];
}

export interface FunnelStat {
  funnel_stage: string;
  campaign_count: number;
  total_sent: number;
  total_opens: number;
  total_replies: number;
}

export interface AiReportResponse {
  report: string;
  timestamp: string;
}
