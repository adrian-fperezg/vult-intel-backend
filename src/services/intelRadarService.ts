import { useOutreachBaseApi } from '../hooks/outreach/useOutreachBaseApi';

export interface RadarSource {
  id: string;
  url: string;
  domain: string;
  reputation: 'high' | 'medium' | 'low';
}

export interface RadarArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  date: string;
  publishDate?: string;
  keywords?: string[];
  socialPostDraft?: string;
}

export const useIntelRadarApi = () => {
  const { 
    get, 
    post, 
    patch, 
    del, 
    activeProjectId 
  } = useOutreachBaseApi();

  const runRadar = async () => {
    return post<any>('/radar/run', {});
  };

  const updateSchedule = async (frequency: string) => {
    return patch<any>('/radar/schedule', { frequency });
  };

  const getSources = async (): Promise<RadarSource[]> => {
    return get<RadarSource[]>('/radar/sources') || [];
  };

  const addSource = async (url: string) => {
    return post<any>('/radar/sources', { url });
  };

  const deleteSource = async (id: string) => {
    return del(`/radar/sources/${id}`);
  };

  const getArticles = async (): Promise<RadarArticle[]> => {
    return get<RadarArticle[]>('/radar/articles') || [];
  };

  const generateThumbnail = async (articleId: string, prompt: string, options?: { aspectRatio?: string, width?: number, height?: number }) => {
    return post<any>('/veo-studio/generate-image', { 
      prompt,
      aspectRatio: options?.aspectRatio || '16:9',
      width: options?.width,
      height: options?.height,
      applyBrandKit: true 
    }, true);
  };

  const enhanceImagePrompt = async (prompt: string) => {
    return post<any>('/veo-studio/enhance-prompt', { prompt }, true);
  };

  const generateSocialPost = async (articleId: string, platform: string, tone: string, language: string = 'en') => {
    return post<any>('/outreach/radar/social-posts/generate', { 
      articleId, 
      platform, 
      tone,
      language
    }, true); // true flag for useRootUrl
  };

  return {
    activeProjectId,
    runRadar,
    updateSchedule,
    getSources,
    addSource,
    deleteSource,
    getArticles,
    generateSocialPost,
    generateThumbnail,
    enhanceImagePrompt,
  };
};

