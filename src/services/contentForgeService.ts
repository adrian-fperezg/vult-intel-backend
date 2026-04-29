import { useOutreachBaseApi } from '../hooks/outreach/useOutreachBaseApi';
import { ActiveProjectData } from './ai';

export interface ContentForgeResponse {
  category: 'create' | 'planning' | 'research';
  variants: string[];
  insight: string;
}

export interface SocialVariation {
  platform: string;
  copy: string;
}

export interface SocialVariationsResponse {
  variations: SocialVariation[];
}

export interface ImageGenerationResponse {
  imageUrl: string;
}

export const useContentForgeApi = () => {
  const { post } = useOutreachBaseApi();

  const generateContent = async (payload: any): Promise<ContentForgeResponse> => {
    return post<ContentForgeResponse>('/outreach/content-forge/generate', payload, true);
  };

  const generateSocialVariations = async (generatedContent: string, language?: string): Promise<SocialVariationsResponse> => {
    return post<SocialVariationsResponse>('/outreach/content-forge/social-variations', { 
      generatedContent, 
      language 
    }, true);
  };

  const generateImage = async (prompt: string): Promise<ImageGenerationResponse> => {
    return post<ImageGenerationResponse>('/outreach/content-forge/generate-image', { 
      prompt 
    }, true);
  };

  return {
    generateContent,
    generateSocialVariations,
    generateImage,
  };
};
