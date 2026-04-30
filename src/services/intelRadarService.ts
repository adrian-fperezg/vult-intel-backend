import { useCallback } from 'react';
import { useOutreachBaseApi } from '@/hooks/outreach/useOutreachBaseApi';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RadarArticle {
  id: string;
  project_id: string;
  title: string;
  url: string;
  summary: string;
  ai_summary: string;
  keywords: string[];          // parsed from JSON in DB
  relevance_score: number;     // 0–100
  source_domain: string;
  source_reputation: 'high' | 'medium' | 'low';
  published_at: string | null;
  scan_run_id: string | null;
  created_at: string;
  social_post_draft: string | null;
  social_post_platform: string | null;
  social_post_id: string | null;
}

export interface RadarDateSummary {
  date: string;  // 'YYYY-MM-DD'
  count: number;
}

export interface RadarArticlesResponse {
  articles: RadarArticle[];
  datesWithArticles: RadarDateSummary[];
}

export interface RadarSource {
  id: string;
  project_id: string;
  domain_url: string;
  name: string;
  created_at: string;
}

export interface RadarSchedule {
  project_id: string;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  is_enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface RadarScanStatus {
  status: 'running' | 'complete' | 'failed';
  articles_found: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface GenerateContentParams {
  articleId: string;
  platform: 'linkedin' | 'twitter' | 'instagram' | 'threads' | 'facebook' | 'blog';
  tone?: string;
  voice?: string;
  language?: 'en' | 'es';
  cta?: string;
  hashtags?: boolean;
  blogTitle?: string;
  blogWordCount?: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useIntelRadarApi() {
  const { get, post, patch, del } = useOutreachBaseApi();

  // ── Articles ──────────────────────────────────────────────────────────────

  const getArticles = useCallback(
    async (params?: { date?: string; minRelevance?: number }): Promise<RadarArticlesResponse> => {
      const qs = new URLSearchParams();
      if (params?.date) qs.set('date', params.date);
      if (params?.minRelevance != null) qs.set('minRelevance', String(params.minRelevance));
      const query = qs.toString() ? `&${qs.toString()}` : '';
      const data = await get(`/radar/articles${query ? '?' + qs.toString() : ''}`);
      // Normalize: if backend returns legacy flat array, wrap it
      if (Array.isArray(data)) {
        return { articles: data as RadarArticle[], datesWithArticles: [] };
      }
      return data as RadarArticlesResponse;
    },
    [get]
  );

  // ── Run Now ───────────────────────────────────────────────────────────────

  const triggerScan = useCallback(async (): Promise<{ jobId: string; scanRunId: string }> => {
    return post('/radar/run', {});
  }, [post]);

  // ── Scan Status Polling ───────────────────────────────────────────────────

  const getScanStatus = useCallback(async (scanRunId: string): Promise<RadarScanStatus> => {
    return get(`/radar/scan-status/${scanRunId}`);
  }, [get]);

  // ── Schedule ──────────────────────────────────────────────────────────────

  const getSchedule = useCallback(async (): Promise<RadarSchedule> => {
    return get('/radar/schedule');
  }, [get]);

  const saveSchedule = useCallback(
    async (frequency: string, isEnabled: boolean): Promise<void> => {
      await post('/radar/schedule', { frequency, isEnabled });
    },
    [post]
  );

  // ── Sources ───────────────────────────────────────────────────────────────

  const getSources = useCallback(async (): Promise<RadarSource[]> => {
    return get('/radar/sources');
  }, [get]);

  const addSource = useCallback(
    async (domainUrl: string, name?: string): Promise<{ id: string }> => {
      return post('/radar/sources', { domainUrl, name });
    },
    [post]
  );

  const deleteSource = useCallback(
    async (id: string): Promise<void> => {
      await del(`/radar/sources/${id}`);
    },
    [del]
  );

  // ── Social Posts ──────────────────────────────────────────────────────────

  const getSocialPosts = useCallback(async () => {
    return get('/radar/social-posts');
  }, [get]);

  const updateSocialPost = useCallback(
    async (id: string, updates: { status?: string; content?: string }): Promise<void> => {
      await patch(`/radar/social-posts/${id}`, updates);
    },
    [patch]
  );

  // ── Content Studio — Multi-Platform Generation ────────────────────────────

  const generateContent = useCallback(
    async (params: GenerateContentParams): Promise<{ content: string; postId: string }> => {
      return post('/radar/generate-content', params as unknown as Record<string, unknown>);
    },
    [post]
  );

  // ── Visual Studio ─────────────────────────────────────────────────────────

  const enhancePrompt = useCallback(
    async (prompt: string): Promise<{ enhanced: string }> => {
      return post('/veo-studio/enhance-prompt', { prompt });
    },
    [post]
  );

  const generateImage = useCallback(
    async (params: {
      prompt: string;
      aspectRatio?: string;
      width?: number;
      height?: number;
    }): Promise<{ jobId: string }> => {
      return post('/veo-studio/generate-image', params);
    },
    [post]
  );

  const getImageJobStatus = useCallback(
    async (jobId: string): Promise<{ status: string; imageUrl?: string; error?: string }> => {
      return get(`/veo-studio/job-status/${jobId}`);
    },
    [get]
  );

  return {
    // Articles
    getArticles,
    // Run
    triggerScan,
    getScanStatus,
    // Schedule
    getSchedule,
    saveSchedule,
    // Sources
    getSources,
    addSource,
    deleteSource,
    // Social posts
    getSocialPosts,
    updateSocialPost,
    // Content Studio
    generateContent,
    // Visual Studio
    enhancePrompt,
    generateImage,
    getImageJobStatus,
  };
}
