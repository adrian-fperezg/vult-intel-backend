import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
  socialPostDraft?: string;
}

export const useIntelRadarApi = () => {
  const { currentUser } = useAuth();
  const { activeProjectId } = useProject();

  const getHeaders = async () => {
    const token = await currentUser?.getIdToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-project-id': activeProjectId || '',
    };
  };

  const runRadar = async () => {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/radar/run`, {
      method: 'POST',
      headers,
    });
    return response.json();
  };

  const updateSchedule = async (frequency: string) => {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/radar/schedule`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ frequency }),
    });
    return response.json();
  };

  const getSources = async (): Promise<RadarSource[]> => {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/radar/sources`, { headers });
    return response.json();
  };

  const addSource = async (url: string) => {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/radar/sources`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    });
    return response.json();
  };

  const deleteSource = async (id: string) => {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/radar/sources/${id}`, {
      method: 'DELETE',
      headers,
    });
    return response.json();
  };

  const getArticles = async (): Promise<RadarArticle[]> => {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/radar/articles`, { headers });
    return response.json();
  };

  const generateThumbnail = async (articleId: string, prompt: string) => {
    const outreachBase = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';
    const token = await currentUser?.getIdToken();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-project-id': activeProjectId || '',
    };

    const response = await fetch(`${outreachBase}/api/veo-studio/generate-image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        prompt: `Thumbnail for article: ${prompt}`,
        aspectRatio: '16:9',
        applyBrandKit: true 
      }),
    });
    return response.json();
  };

  const generateSocialPost = async (articleId: string, platform: string, tone: string) => {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/outreach/radar/social-posts/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ articleId, platform, tone }),
    });
    return response.json();
  };

  return {
    runRadar,
    updateSchedule,
    getSources,
    addSource,
    deleteSource,
    getArticles,
    generateSocialPost,
    generateThumbnail,
  };
};

