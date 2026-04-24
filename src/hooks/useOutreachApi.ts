import { useMemo } from 'react';
import { useOutreachBaseApi } from './outreach/useOutreachBaseApi';
import { useOutreachCampaigns } from './outreach/useOutreachCampaigns';
import { useOutreachSequences } from './outreach/useOutreachSequences';
import { useOutreachContacts } from './outreach/useOutreachContacts';
import { useOutreachAnalytics } from './outreach/useOutreachAnalytics';
import { useOutreachSettings } from './outreach/useOutreachSettings';
import { useOutreachMailboxes } from './outreach/useOutreachMailboxes';

import type { AnalyticsData, FunnelStat, AiReportResponse } from '@shared/types/outreach';
export type { AnalyticsData, FunnelStat, AiReportResponse };

/**
 * Central hook for all Outreach API calls.
 * 
 * NOTE: This is now a "facade" hook that aggregates specialized hooks.
 * For new development, prefer importing the specific hook you need:
 * - useOutreachCampaigns
 * - useOutreachSequences
 * - useOutreachContacts
 * - useOutreachAnalytics
 * - useOutreachSettings
 * - useOutreachMailboxes
 */
export function useOutreachApi() {
  const base = useOutreachBaseApi();
  const campaigns = useOutreachCampaigns();
  const sequences = useOutreachSequences();
  const contacts = useOutreachContacts();
  const analytics = useOutreachAnalytics();
  const settings = useOutreachSettings();
  const mailboxes = useOutreachMailboxes();

  return useMemo(() => ({
    ...base,
    ...campaigns,
    ...sequences,
    ...contacts,
    ...analytics,
    ...settings,
    ...mailboxes,
    // Alias for backward compatibility where names were duplicate or slightly different
    promoteSequenceQueue: sequences.promoteSequenceJobs,
  }), [base, campaigns, sequences, contacts, analytics, settings, mailboxes]);
}
