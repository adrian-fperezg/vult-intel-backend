import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { doc, increment, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { saveBuyerPersona, BuyerPersona } from './brandStrategyService';
import { trackImageGeneration, trackDeepScanGeneration } from '@/services/analytics';
import { isFounder as checkIsFounder } from '@/utils/founderUtils';
import { safeJsonParse } from '@/utils/jsonUtils';
import { getLanguageDirective } from '@/utils/aiLanguageUtils';

// WARNING: Cloud transition in progress. Direct client-side calls are being deprecated
// for security. Use a backend proxy for production deployments.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; // Temporary until proxy is live
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });


// ── Core Imports & Global AI Client ──────────────────────────────────────────

// Define our specific models
const MODEL_FLASH = 'gemini-1.5-flash';
const MODEL_PRO = 'gemini-1.5-pro';

// ── Smart AI Router ─────────────────────────────────────────────────────────
export class AIRouter {
  static getModel(taskComplexity: 'simple' | 'complex'): string {
    return taskComplexity === 'complex' ? MODEL_PRO : MODEL_FLASH;
  }
}

// ── Context Caching ──────────────────────────────────────────────────────────
export class ContextCacher {
  // Store generated cache names by project string representation (hash/JSON)
  private static cacheMap: Map<string, { cacheName: string, expiresAt: number }> = new Map();

  // Simple string hash for the project data
  private static hashProjectData(data: ActiveProjectData | null | undefined): string {
    if (!data) return 'default';
    // We only hash the relevant parts that affect the system instruction
    return JSON.stringify({
      p: data.project,
      v: data.voice,
      pe: data.personas,
      pi: data.pillars
    });
  }

  static async getCacheConfig(
    projectContext: ActiveProjectData | null | undefined,
    fallbackModel: string = 'gemini-2.5-flash'
  ): Promise<{
    cacheName?: string;
    systemInstruction?: string;
    model: string;
  }> {
    const langDirective = getLanguageDirective();
    const systemContext = constructSystemContext(projectContext);

    // If no context, just use standard call
    if (!projectContext) {
      return { systemInstruction: systemContext, model: fallbackModel };
    }

    const hashKey = `${localStorage.getItem('vult_language') || 'es'}_${this.hashProjectData(projectContext)}`;
    const now = Date.now();

    // Check local memory map first
    if (this.cacheMap.has(hashKey)) {
      const entry = this.cacheMap.get(hashKey)!;
      // If we have at least 15 mins left on the cache
      if (entry.expiresAt > now + 15 * 60 * 1000) {
        console.log(`[ContextCacher] HIT - Reusing context ${entry.cacheName}`);
        return { cacheName: entry.cacheName, model: fallbackModel };
      }
    }

    try {
      console.log(`[ContextCacher] MISS - Generating new cache...`);

      // TTL required by Gemini SDK format
      const ttlSeconds = 3600; // 1 hour

      const newCache = await ai.caches.create({
        model: fallbackModel,
        config: {
          contents: [
            { role: 'user', parts: [{ text: "This is the initial system context for the project. Please acknowledge." }] }
          ],
          systemInstruction: systemContext,
          ttl: `${ttlSeconds}s`,
        }
      });

      if (newCache.name) {
        const expiresAt = now + (ttlSeconds * 1000);
        this.cacheMap.set(hashKey, { cacheName: newCache.name, expiresAt });
        console.log(`[ContextCacher] Created new cache: ${newCache.name}`);
        return { cacheName: newCache.name, model: fallbackModel };
      }
    } catch (err) {
      console.warn(`[ContextCacher] Failed to create cache, falling back to standard prompt:`, err);
    }

    // Fallback if cache fails
    return { systemInstruction: systemContext, model: fallbackModel };
  }
}

// ── Project Context Types ───────────────────────────────────────────────────

export interface ActiveProjectData {
  project: {
    name: string;
    description: string;
    niche: string;
    url: string;
  };
  voice: {
    valueProposition: string;
    archetype: string;
    formalityCasual: number;
    authoritativeEmpathetic: number;
    seriousPlayful: number;
    vocabularyAllowlist: string[];
    vocabularyBanlist: string[];
  } | null;
  personas: {
    name: string;
    jobTitle: string;
    goals: string;
    painPoints: string;
    preferredTone: string;
  }[];
  pillars: {
    name: string;
    coreTheme: string;
    aiDirective: string;
  }[];
}

export function constructSystemContext(data: ActiveProjectData | null | undefined, language?: string): string {
  const langDirective = getLanguageDirective(language as any);

  let context = `\n\n--- GLOBAL SYSTEM DIRECTIVE ---\n${langDirective}\n`;

  if (!data) return context;

  context += `\n--- MANDATORY PROJECT CONTEXT: ${data.project.name} ---\n`;
  context += `Primary Description: ${data.project.description}\n`;
  context += `Niche/Industry: ${data.project.niche}\n`;

  if (data.voice) {
    context += `\nBRAND VOICE & POSITIONING:\n`;
    context += `- Value Proposition: ${data.voice.valueProposition}\n`;
    context += `- Core Archetype: ${data.voice.archetype}\n`;
    context += `- Tone Calibration (0-100): Casualness: ${data.voice.formalityCasual}, Empathy: ${data.voice.authoritativeEmpathetic}, Playfulness: ${data.voice.seriousPlayful}\n`;
    if (data.voice.vocabularyAllowlist.length > 0) {
      context += `- Preferred Words (Use frequently): ${data.voice.vocabularyAllowlist.join(', ')}\n`;
    }
    if (data.voice.vocabularyBanlist.length > 0) {
      context += `- Banned Words (NEVER use): ${data.voice.vocabularyBanlist.join(', ')}\n`;
    }
  }

  if (data.personas.length > 0) {
    context += `\nTARGET PERSONAS (Write for these people):\n`;
    data.personas.forEach(p => {
      context += `- ${p.name} (${p.jobTitle}): Goals: ${p.goals}, Pain: ${p.painPoints}, Tone: ${p.preferredTone}\n`;
    });
  }

  if (data.pillars.length > 0) {
    context += `\nCONTENT PILLARS & THEMATIC BOUNDARIES:\n`;
    data.pillars.forEach(p => {
      context += `- ${p.name}: ${p.coreTheme}. Directive: ${p.aiDirective}\n`;
    });
  }

  context += `\nAI DIRECTIVE: You are an expert marketer for this specific brand. Every word you generate must be consistent with this identity. If the user request conflicts with the brand voice, prioritize the brand voice while still answering the request.\n`;

  return context;
}

// ── Token Tracking ────────────────────────────────────────────────────────────
// Atomically increments any usage field in Firestore (tokens, images, videos, scans).
// Safe to call with null uid — silently skips if user is not logged in.
export async function incrementUsage(
  uid: string | null | undefined,
  field: 'totalTokensUsed' | 'imagesGenerated' | 'videosGenerated' | 'deepScansGenerated',
  count: number = 1
): Promise<void> {
  if (!uid || count <= 0) return;
  try {
    await setDoc(
      doc(db, 'customers', uid),
      { [field]: increment(count) },
      { merge: true }
    );
  } catch (err) {
    console.warn(`Failed to record ${field} usage:`, err);
  }
}

// Kept for backwards compatibility if needed, but redirects to incrementUsage
export async function incrementTokens(uid: string | null | undefined, count: number): Promise<void> {
  return incrementUsage(uid, 'totalTokensUsed', count);
}

/**
 * Validates if the user has tokens available. 
 * If it's the founder, the check is bypassed but usage will still be tracked eventually.
 */
export function validateQuota(tokensAvailable: number, email?: string | null): void {
  if (checkIsFounder(email)) return; // Founders have infinite balance
  if (tokensAvailable <= 0) {
    throw new Error("Sin tokens");
  }
}

/**
 * PROXY WRAPPER (Recommended for production)
 * This should eventually replace direct client-side calls to ai.models.generateContent
 */
async function callSecureAIProxy(model: string, contents: any, config?: any) {
  // In a real production environment, this would be:
  // const response = await fetch('/api/generate', { method: 'POST', body: JSON.stringify({ model, contents, config }) });
  // return response.json();
  
  // For now, we remain on the client-side but mark it for migration
  return ai.models.generateContent({ model, contents, config });
}

export async function generateImage(prompt: string, uid?: string | null): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        }
      }
    });

    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content?.parts) {
      throw new Error("No image data returned from AI");
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        // Record usage in background securely
        incrementUsage(uid, 'imagesGenerated', 1).catch(console.error);
        if (uid) trackImageGeneration(uid);

        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}

export async function generateVideo(prompt: string, imageBase64?: string, uid?: string | null): Promise<string> {
  // Use VITE_GEMINI_API_KEY as primary key, fallback to process.env.API_KEY if available
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : null);

  if (!apiKey) {
    throw new Error("Gemini API Key not found. Please check your configuration.");
  }

  const userAi = new GoogleGenAI({ apiKey });

  try {
    let operation;

    if (imageBase64) {
      // Remove data URL prefix if present
      const base64Data = imageBase64.split(',')[1] || imageBase64;

      operation = await userAi.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        image: {
          imageBytes: base64Data,
          mimeType: 'image/png',
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });
    } else {
      operation = await userAi.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });
    }

    // Poll for completion (timeout after 2 minutes)
    const startTime = Date.now();
    const timeout = 120000;

    while (!operation.done) {
      if (Date.now() - startTime > timeout) {
        throw new Error("Video generation timed out. Please try again later.");
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await userAi.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("No video generated in the response");

    // Fetch the video content
    const response = await fetch(downloadLink, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Record usage in background
    incrementUsage(uid, 'videosGenerated', 1).catch(console.error);

    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Error generating video:", error);
    throw error;
  }
}

export async function deepScan(query: string, uid?: string | null): Promise<string> {
  try {
    const projectInfo = constructSystemContext(null); // Just for language/global rules
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: `Perform a deep market analysis for: ${query}. 
${projectInfo}
      Include:
      1. Brand Identity Analysis
      2. Digital Presence Score (0-100)
      3. Key Competitors
      4. SEO Opportunities
      5. Actionable Recommendations
      
      Format the output as Markdown.
      ${getLanguageDirective()}`,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });

    if (uid) trackDeepScanGeneration(uid);
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Error performing deep scan:", error);
    throw error;
  }
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  parts: { text: string }[];
}

export async function generateChatResponse(
  messages: ChatMessage[],
  uid?: string | null,
  projectContext?: ActiveProjectData | null,
  language?: string
): Promise<string> {
  try {
    const systemContext = constructSystemContext(projectContext, language);

    // Combine system context with messages
    // Gemini 2.5-flash supports system instruction
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: messages,
      config: {
        systemInstruction: systemContext,
      },
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);
    return response.text || "No response generated.";
  } catch (error) {
    console.error("Error generating chat response:", error);
    throw error;
  }
}

export async function generateText(
  prompt: string,
  uid?: string | null,
  projectContext?: ActiveProjectData | null
): Promise<string> {
  try {
    const fullPrompt = prompt + constructSystemContext(projectContext);
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
    });
    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);
    return response.text || "No content generated.";
  } catch (error) {
    console.error("Error generating text:", error);
    throw error;
  }
}

export async function generateSpeech(text: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: {
        parts: [{ text }],
      },
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");

    return `data:audio/mp3;base64,${base64Audio}`;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
}

export interface KeywordResearchData {
  competitors: {
    domain: string;
    relevance: number;
    type: string;
  }[];
  keywords: {
    kw: string;
    intent: string;
    vol: string;
    diff: number;
    features: string[];
    action: string;
  }[];
  questions: string[];
}

export async function generateKeywordResearch(
  seed: string,
  intent: string,
  country: string,
  uid?: string | null,
  projectContext?: ActiveProjectData | null
): Promise<KeywordResearchData> {
  try {
    const projectInfo = constructSystemContext(projectContext);
    const prompt = `Act as a world-class SEO strategist. Perform keyword and competitor research for the seed keyword: "${seed}".
${projectInfo}

Context:
- Target Search Intent: ${intent}
- Target Country: ${country}

Generate a comprehensive JSON response containing:
1. "competitors": An array of at least 4 top ranking competitor domains related to the seed keyword. Each must have:
   - "domain" (string)
   - "relevance" (number 0-100 indicating how relevant their offering is to the seed)
   - "type" (string, e.g., "Direct", "Aggregator", "Indirect")
2. "keywords": An array of EXACTLY 20 high-value keyword opportunities. Each must have:
   - "kw" (the keyword string)
   - "intent" (string: "Info", "Comm", "Trans", or "Nav")
   - "vol" (string estimated monthly search volume, e.g., "12K", "500", "1.2M")
   - "diff" (number 0-100 difficulty)
   - "features" (array of strings, e.g., ["Snippet", "Video", "People Also Ask"])
   - "action" (string suggested content type, e.g., "Blog", "Landing Page", "Comparison", "Guide")
3. "questions": An array of EXACTLY 10 of the most searched questions related to the seed keyword. Order them from highest search volume to lowest. Each element is a string.

${getLanguageDirective()}
OUTPUT STRICTLY VALID JSON. DO NOT wrap with \`\`\`json.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);

    const text = response.text;
    if (!text) throw new Error("No content generated");

    return safeJsonParse(text) as KeywordResearchData;
  } catch (error) {
    console.error("Error generating keyword research:", error);
    throw error;
  }
}

// ----------------------------------------------------------------------
// SEO Audit & Action Plan
// ----------------------------------------------------------------------

export interface SeoAuditData {
  overallHealth: {
    totalScore: number;
    comparisonText: string;
    subscores: {
      technical: number;
      content: number;
      internalLinking: number;
      performance: number;
      schema: number;
    };
  };
  quickInsights: {
    type: 'Critical Error' | 'Warning' | 'Opportunity';
    title: string;
    description: string;
  }[];
  prioritizedChecklist: {
    issue: string;
    whyItMatters: string;
    recommendedFix: string;
    impact: 'High' | 'Medium' | 'Low';
    effort: 'High' | 'Medium' | 'Low';
    affectedPages: string;
  }[];
  actionPlan: {
    week: number;
    title: string;
    dateRange: string;
    tasks: {
      name: string;
      status: 'todo' | 'in-progress' | 'done';
    }[];
  }[];
}

export async function generateSeoAudit(
  canonicalUrl: string,
  competitors: string[],
  focusPages: string,
  goal: string,
  uid?: string | null,
  projectContext?: ActiveProjectData | null
): Promise<SeoAuditData> {
  if (!canonicalUrl) {
    throw new Error("Canonical URL is required for SEO Audit.");
  }

  try {
    const projectInfo = constructSystemContext(projectContext);
    const prompt = `
You are an expert Technical SEO Specialist and Web Auditor.
Analyze the following website context and generate a complete SEO Audit & 30-Day Action Plan.
${projectInfo}

Target URL: ${canonicalUrl}
Additional Competitors: ${competitors.length > 0 ? competitors.join(', ') : 'None provided'}
Focus Pages: ${focusPages || 'General Sitewide'}
Primary Goal: ${goal || 'Traffic growth and overall health'}

Instructions:
1. Provide a realistic estimated Overall Health Score (0-100) based on typical sites in this niche. Compute subscores for Technical, Content, Internal Linking, Performance, and Schema.
2. Provide a 'comparisonText' string (e.g., "Your site is performing better than 82% of competitors in your niche."). Use realistic, data-driven sounding estimates based on the provided competitors.
3. List 3 to 5 'Quick Insights' categorizing the most pressing issues as 'Critical Error', 'Warning', or 'Opportunity'.
4. Generate a 'Prioritized Checklist' of 4 to 8 actionable issues. For each, assign standard impact/effort levels (High/Medium/Low) and explain why it matters and how to fix it. Mention affected pages conceptually based on the Focus Pages.
5. Create a '30 Day Action Plan' broken down into 4 weeks (Week 1, 2, 3, 4). Each week should have a strategic title (e.g., 'Technical Fixes'), a mock dateRange (e.g., 'Days 1-7'), and 2-4 tasks to accomplish that week.

${getLanguageDirective()}
Respond ONLY with a valid JSON file matching this TypeScript interface exactly:
{
    "overallHealth": {
        "totalScore": number,
        "comparisonText": string,
        "subscores": {
            "technical": number,
            "content": number,
            "internalLinking": number,
            "performance": number,
            "schema": number
        }
    },
    "quickInsights": [
        {
            "type": "Critical Error" | "Warning" | "Opportunity",
            "title": string,
            "description": string
        }
    ],
    "prioritizedChecklist": [
        {
            "issue": string,
            "whyItMatters": string,
            "recommendedFix": string,
            "impact": "High" | "Medium" | "Low",
            "effort": "High" | "Medium" | "Low",
            "affectedPages": string
        }
    ],
    "actionPlan": [
        {
            "week": number,
            "title": string,
            "dateRange": string,
            "tasks": [
                { "name": string, "status": "todo" | "in-progress" | "done" }
            ]
        }
    ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from AI");
    }

    const data = safeJsonParse(textResponse) as SeoAuditData;
    return data;

  } catch (error) {
    console.error("Error generating SEO Audit:", error);
    throw error;
  }
}

export interface BlueprintInputs {
  contentType: string;
  objective: string;
  trafficSource: string;
  targetAudience: string;
  toneOfVoice: {
    fileContent?: string;
    urlContext?: string;
    matchScale: number; // 0 to 100
    allowInternetSearch: boolean;
  };
}

export interface BlueprintData {
  scorecard: {
    clarity: number;
    ctaStrength: number;
    trustProof: number;
    alignment: number;
    seoAnalysis: string;
    overallSummary: string;
  };
  blueprint: Array<{
    sectionName: string;
    purposeTags: string[];
    copyBlocks: string;
  }>;
  experiments: Array<{
    title: string;
    hypothesis: string;
    metrics: string;
  }>;
}

export async function generateLandingBlueprint(
  params: BlueprintInputs,
  uid?: string | null,
  projectContext?: ActiveProjectData | null
): Promise<BlueprintData> {
  try {
    const aiParams: any = {
      model: 'gemini-2.5-flash',
      config: {
        responseMimeType: "application/json",
      }
    };

    if (params.toneOfVoice.allowInternetSearch) {
      aiParams.tools = [{ googleSearchRetrieval: {} }];
    }

    let toneInstructions = "";
    if (params.toneOfVoice.fileContent || params.toneOfVoice.urlContext) {
      toneInstructions = `\n\n--- BRAND VOICE & TONE CONSTANTS ---\n`;
      toneInstructions += `You must emulate the tone and voice provided in the following reference material. `;
      toneInstructions += `The user has specified a Match Scale of ${params.toneOfVoice.matchScale} out of 100. `;
      if (params.toneOfVoice.matchScale > 80) {
        toneInstructions += `(100/100: EXACT MATCH. Strictly write in the exact style, wording format, and personality as the reference).\n`;
      } else if (params.toneOfVoice.matchScale > 40) {
        toneInstructions += `(50/100: MODERATE MATCH. Use it as strong inspiration but feel free to adapt for conversions).\n`;
      } else {
        toneInstructions += `(0/100: LOW MATCH. Use it only for loose context, prioritize industry best practices over the specific reference tone).\n`;
      }

      if (params.toneOfVoice.urlContext) {
        toneInstructions += `\nReference URL Context: ${params.toneOfVoice.urlContext}`;
      }
      if (params.toneOfVoice.fileContent) {
        toneInstructions += `\nReference Content Provided:\n"""${params.toneOfVoice.fileContent}"""\n`;
      }
    }

    const projectInfo = constructSystemContext(projectContext);

    let internetConstraint = "";
    if (!params.toneOfVoice.allowInternetSearch) {
      internetConstraint = "DO NOT use external search. Rely only on your training data and the context provided in this prompt.";
    }

    const prompt = `You are a world-class Conversion Rate Optimization (CRO) expert and Direct Response Copywriter.

The user needs a high-converting ${params.contentType} structural blueprint and copy.
${projectInfo}

Objective: ${params.objective}
Traffic Source: ${params.trafficSource}
Target Audience: ${params.targetAudience}
${internetConstraint}
${toneInstructions}

Generate the page structure, write all the required copy in Markdown formatting (use headings, bold text, bullet points where needed to make it professional), and provide a strategic scorecard evaluation.

${getLanguageDirective()}
Respond strictly in the following JSON format:
{
  "scorecard": {
    "clarity": number (0-100),
    "ctaStrength": number (0-100),
    "trustProof": number (0-100),
    "alignment": number (0-100, how well it matches audience & objective),
    "seoAnalysis": "A short paragraph evaluating SEO potential based on the context",
    "overallSummary": "A brief summary of why this blueprint will work"
  },
  "blueprint": [
    {
      "sectionName": "e.g., Hero Header, Problem Agitation, Solution Overview, FAQ, Social Proof",
      "purposeTags": ["e.g., Hook the reader", "State the primary benefit", "DO NOT WRITE COPY HERE, JUST SHORT TAGS"],
      "copyBlocks": "The actual, beautifully written markdown copy for this specific section."
    }
  ],
  "experiments": [
    {
      "title": "A/B test idea title",
      "hypothesis": "Why this test might boost conversions",
      "metrics": "What to measure (e.g., CTR, Time on page, Signups)"
    }
  ]
}
`;

    aiParams.contents = prompt;

    const response = await ai.models.generateContent(aiParams);

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from AI");
    }

    const data = safeJsonParse(textResponse) as BlueprintData;
    return data;

  } catch (error) {
    console.error("Error generating Landing Blueprint:", error);
    throw error;
  }
}

// ---- Research Hub AI Analysis ----

export interface ResearchIdea {
  title: string;
  suggestedFormat: string;
  angle: string;
  readyPrompt: string;
}

export interface ResearchAnalysis {
  summary: string;
  keyPoints: string[];
  hiddenAngles: string[];
  ideas: ResearchIdea[];
}

export async function analyzeResearchSources(
  sources: { label: string; content: string }[],
  projectNiche: string,
  uid?: string | null,
  projectContext?: ActiveProjectData | null
): Promise<ResearchAnalysis> {
  try {
    const combinedContent = sources
      .map((s) => `--- SOURCE: ${s.label} ---\n${s.content}`)
      .join('\n\n');

    const projectInfo = constructSystemContext(projectContext);

    const prompt = `You are a world-class content strategist and researcher specializing in digital marketing for ${projectNiche}.
${projectInfo}

The user has provided the following source material for deep analysis:

${combinedContent}

Your task is to perform a comprehensive research analysis. Return a strict JSON response with the following structure:

{
  "summary": "A concise 2-4 sentence executive summary of what these sources are about and their combined strategic importance.",
  "keyPoints": [
    "Key point 1 extracted from the sources",
    "Key point 2 extracted from the sources",
    "Key point 3 extracted from the sources",
    "Key point 4 extracted from the sources",
    "Key point 5 extracted from the sources"
  ],
  "hiddenAngles": [
    "A specific overlooked angle, gap, or unanswered question that presents a high-value content opportunity",
    "Another overlooked angle or contrarian viewpoint not addressed in the source",
    "A third angle focused on the audience pain points implied but not directly stated",
    "A fourth opportunity based on keyword or topic clusters in the source"
  ],
  "ideas": [
    {
      "title": "A compelling content idea title",
      "suggestedFormat": "e.g., LinkedIn Post, Twitter Thread, Short Video Script, Email Newsletter, Blog Outline",
      "angle": "One sentence explaining the unique angle or hook for this idea",
      "readyPrompt": "Write a [format] about [specific topic derived from source]. The core argument is [angle]. Focus on [specific insight from source]. Make it specific, data-driven where possible, and highly valuable to professionals in [projectNiche]. Do NOT add generic calls to action."
    },
    {
      "title": "Second content idea",
      "suggestedFormat": "e.g., Instagram Carousel, Twitter Thread",
      "angle": "One sentence unique hook",
      "readyPrompt": "The ready-to-use prompt — remember, absolutely NO tone of voice, persona, or character instructions. Only pure topic and content instructions."
    },
    {
      "title": "Third idea",
      "suggestedFormat": "e.g., Short Form Video Script",
      "angle": "Unique hook",
      "readyPrompt": "Ready-to-use prompt without any persona or tone instructions."
    },
    {
      "title": "Fourth idea",
      "suggestedFormat": "e.g., LinkedIn Post",
      "angle": "Unique hook",
      "readyPrompt": "Ready-to-use prompt."
    },
    {
      "title": "Fifth idea",
      "suggestedFormat": "e.g., Email Newsletter",
      "angle": "Unique hook",
      "readyPrompt": "Ready-to-use prompt."
    }
  ]
}

CRITICAL RULES:
1. The "readyPrompt" for each idea must NEVER contain any instructions about tone of voice, persona, style, or character. Only topic-level instructions are allowed.
2. Return ONLY valid JSON — no markdown, no backticks, no commentary.
3. All content must be directly grounded in the provided sources, not generic filler.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);

    const text = response.text;
    if (!text) throw new Error('Empty response from AI');

    return safeJsonParse(text) as ResearchAnalysis;
  } catch (error) {
    console.error('Error analyzing research sources:', error);
    throw error;
  }
}

// ── Social Presence Ideas ─────────────────────────────────────────────────────

export interface SocialIdeaResult {
  platform: string;
  caption: string;
  hashtags: string[];
}

export async function generateSocialIdeas(
  topic: string,
  uid?: string | null,
  projectContext?: ActiveProjectData | null
): Promise<SocialIdeaResult[]> {
  try {
    const projectInfo = constructSystemContext(projectContext);
    const prompt = `You are an expert social media strategist. Generate exactly 5 social media post ideas for the following topic or brand: "${topic}".
${projectInfo}

For each idea, choose the most appropriate platform from: LinkedIn, Instagram, Twitter/X, Facebook, TikTok.

Return ONLY valid JSON — no markdown, no backticks:
[
  {
    "platform": "LinkedIn",
    "caption": "Full post caption ready to copy and paste, engaging and platform-appropriate.",
    "hashtags": ["tag1", "tag2", "tag3"]
  }
]

Rules:
- Each idea must target a different platform.
- Keep captions concise and punchy.
- Include 3 to 5 relevant hashtags per post.
- No tone or persona instructions — focus purely on the topic.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);

    const text = response.text;
    if (!text) throw new Error('Empty response from AI');

    return safeJsonParse(text) as SocialIdeaResult[];
  } catch (error) {
    console.error('Error generating social ideas:', error);
    throw error;
  }
}

export interface GeneratedWorkflow {
  name: string;
  fields: { label: string; value: string; type: 'text' | 'textarea' | 'number' }[];
  customFields: { label: string; value: string; type: 'text' | 'textarea' | 'number' }[];
}

export async function generateWorkflow(
  prompt: string,
  uid?: string | null,
  projectContext?: ActiveProjectData | null
): Promise<GeneratedWorkflow> {
  try {
    const projectInfo = constructSystemContext(projectContext);
    const systemPrompt = `You are a world-class systems architect and growth marketer.
${projectInfo}

The user needs a strategic workflow (e.g. Sales Funnel, Client Roadmap, Email Automation, or a custom operational loop).
User request: ${prompt}

Design a sequential step-by-step workflow.
Respond ONLY with a valid JSON object matching this TypeScript interface exactly:
{
  "name": "A catchy, accurate name for the workflow (e.g., 'High-Ticket Webinar Funnel')",
  "fields": [
    {
      "label": "Name of the step (e.g., 'Traffic Source', 'Landing Page')",
      "value": "What happens here (e.g., 'Facebook Ads targeting lookalikes')",
      "type": "text" | "textarea" | "number"
    }
  ],
  "customFields": [
    {
      "label": "A specific configuration parameter or metric (e.g., 'Target CPA ($)')",
      "value": "A realistic default value",
      "type": "text" | "textarea" | "number"
    }
  ]
}

Make sure "fields" represents the core sequential flow (4-7 steps usually).
Make sure "customFields" represents the global settings/metrics for this workflow (3-6 fields usually).
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from AI");
    }

    const data = safeJsonParse(textResponse) as GeneratedWorkflow;
    return data;
  } catch (error) {
    console.error("Error generating workflow:", error);
    throw error;
  }
}

export async function generateBrainstorming(
  promptText: string,
  uid?: string | null,
  projectContext?: ActiveProjectData | null
): Promise<ResearchIdea[]> {
  try {
    const projectInfo = constructSystemContext(projectContext);

    const prompt = `You are a world-class creative director and content strategist.
Based on the following brand context and the user's focus prompt, brainstorm 5 to 8 unique and highly engaging content ideas.
IMPORTANT FORMAT RULE: If you suggest a 'Video' format, the idea must be explicitly designed for short clips (b-roll or short AI generated videos with tools like Google Veo). Do NOT suggest long formats or documentaries.

Brand Context:
${projectInfo}

User's Focus Prompt:
"${promptText}"

Return the result EXACTLY as a JSON array of objects with the following keys, and nothing else:
[
  {
    "title": "A catchy, scroll-stopping headline or hook",
    "angle": "Brief explanation of the psychological angle, why it works, and what the core message is",
    "suggestedFormat": "e.g., LinkedIn Carousel, TikTok Hook + Story, Email Newsletter, etc.",
    "readyPrompt": "A detailed follow-up prompt that the user can click to instantly generate this specific piece of content in our generator"
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    await incrementTokens(uid, tokens);

    const text = response.text;
    if (!text) throw new Error('Empty response from AI');

    return safeJsonParse(text) as ResearchIdea[];
  } catch (error) {
    console.error('Error in brainstorming generation:', error);
    throw error;
  }
}

export async function extractAndSavePersonas(projectId: string, scanDataString: string, uid?: string | null): Promise<void> {
  if (!uid && !auth.currentUser) return;
  const userUid = uid || auth.currentUser?.uid;
  if (!userUid) return;

  try {
    const prompt = `Based on the following marketing deep scan, extract 1 to 3 distinct buyer personas.
Return the result EXACTLY as a JSON array of objects with the following keys, and nothing else (no markdown blocks, no intro).
If there is not enough information to form a persona, return an empty array [].
[
  {
    "name": "Creative name for persona",
    "ageRange": "e.g. 25-34",
    "gender": "e.g. Female / Any",
    "location": "e.g. Urban / Global",
    "jobTitle": "e.g. Marketing Manager",
    "income": "e.g. $50k-$80k",
    "goals": "Short sentence about their goals",
    "painPoints": "Short sentence about their pain points",
    "objections": "Short sentence about their objections",
    "mediaHabits": "Where they hang out online",
    "preferredTone": "Tone of voice they respond to, e.g. Direct and Professional",
    "triggerWords": "Words that grab their attention, e.g. Speed, ROI"
  }
]

Deep Scan Data:
${scanDataString}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    if (uid) {
      await incrementTokens(uid, tokens);
    }

    const text = response.text;
    if (!text) return;

    const personas = JSON.parse(text);

    if (Array.isArray(personas)) {
      for (const p of personas) {
        if (p.name) {
          await saveBuyerPersona(projectId, p);
        }
      }
    }
  } catch (e) {
    console.error("Auto extraction of personas failed:", e);
  }
}

export async function generateGrowthMastermindStrategy(
  objective: string,
  scanReportContext: string,
  brandStrategyContext: string,
  personaContext: string,
  uid?: string | null,
  customInstructions?: string
): Promise<string> {
  try {
    const customBlock = customInstructions?.trim()
      ? `\n\n--- USER CUSTOM INSTRUCTIONS (HIGH PRIORITY — Respect these above all else) ---\n${customInstructions.trim()}\n--- END CUSTOM INSTRUCTIONS ---`
      : '';

    const prompt = `You are a world-class Chief Marketing Officer (CMO) and Growth Strategist.
Your task is to synthesize the provided contextual intelligence from the user's project to engineer the ultimate Marketing Masterplan.

PRIMARY OBJECTIVE OF THE CAMPAIGN: "${objective}"
${customBlock}

PROJECT CONTEXT:
--- 1. Full Scan Report ---
${scanReportContext ? scanReportContext : 'No Deep Scan available yet.'}

--- 2. Global Brand Strategy ---
${brandStrategyContext ? brandStrategyContext : 'No Brand Strategy attached yet.'}

--- 3. Persona Studio Details ---
${personaContext ? personaContext : 'No Buyer Personas attached yet.'}

OUTPUT FORMAT RULES (NON-NEGOTIABLE):
You MUST return the strategy as structured, professional MARKDOWN following this EXACT hierarchy:

# [Campaign Title — creative but descriptive, based on the objective]

## Executive Summary
A concise (3-5 sentence) paragraph synthesizing the campaign approach, the core opportunity identified in the scan data, and the key bet being placed to achieve the objective.

## Messaging Angles
### Core Value Proposition
### Headline Formulas & Copy Angles
### Tone & Voice Directives
### Key Differentiators to Amplify

## Email Marketing Strategy
### Segmentation & List Strategy
### Automated Sequence Architecture
### Key Subject Line Formulas
### KPIs to Track

## Social Media Strategy (Organic)
### Platform Priority & Rationale
### Content Pillars & Formats
### Publishing Cadence
### Engagement & Community Tactics

## Paid Advertising Campaigns
### Campaign Architecture (ToFu / MoFu / BoFu)
### Audience Targeting Framework
### Creative & Copy Direction
### Budget Allocation Guidance
### Retargeting Sequences

## SEO & Web Content Strategy
### Priority Keyword Clusters
### Content Hub Architecture
### On-Page & Technical Quick Wins
### Link Building Angle

## 30-60-90 Day Execution Roadmap
Use bullet points extensively under each section and subsection. Be TACTICAL and SPECIFIC — reference the personas, brand voice, and scan insights directly. Avoid generic filler. Write in the language inferred from the context.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    if (uid) {
      await incrementTokens(uid, tokens);
    }

    const text = response.text;
    if (!text) throw new Error('Empty response from AI for Growth Strategy');

    return text;
  } catch (error) {
    console.error('Error generating Growth Mastermind strategy:', error);
    throw error;
  }
}


export async function generatePersonaFromReport(fullScanText: string, uid?: string | null): Promise<Partial<BuyerPersona>> {
  try {
    const sysLang = localStorage.getItem('vult_language') || 'es';
    const langDirective = sysLang === 'en'
      ? "CRITICAL RULE: You MUST output the entire JSON content in English, translating the keys' values but keeping the JSON keys exactly as requested."
      : "CRITICAL RULE: You MUST output the entire JSON content in Spanish, translating the keys' values but keeping the JSON keys exactly as requested.";

    const prompt = `Actúa como un Estratega de Marca Experto y Psicólogo de Consumidor.
Tu tarea es leer un reporte de mercado (Full Scan Report) de un negocio y deducir con precisión quirúrgica quién es su Cliente Ideal (Buyer Persona) de mayor conversión.

REPORTE DE REFERENCIA:
${fullScanText}

INSTRUCCIONES CRÍTICAS:
1. Analiza profundamente las secciones de Brand Identity, Competitors y Actionable Recommendations del reporte.
2. Identifica a la persona que tiene el "dolor" exacto que este negocio resuelve.
3. No des explicaciones, saludos ni introducciones.
4. Devuelve ÚNICAMENTE un objeto JSON válido (sin etiquetas markdown, no uses \`\`\`json) con las siguientes claves exactas. Esto se usará para autocompletar una base de datos.
5. ${langDirective}

ESTRUCTURA JSON REQUERIDA:
{
  "name": "Nombre descriptivo y creativo (ej. El Fundador Atrapado)",
  "ageRange": "Rango de edad lógico (ej. 30-45)",
  "gender": "Género (ej. Femenino, Masculino, o Cualquiera)",
  "location": "Ubicación ideal (ej. Urbano, LATAM, Global)",
  "jobTitle": "Puesto de trabajo o rol",
  "income": "Nivel de ingresos estimado (ej. $80k-$120k)",
  "goals": "Su meta principal de negocio o vida relacionada al reporte",
  "painPoints": "El problema agudo que el negocio analizado le resuelve",
  "objections": "La razón principal por la que dudaría en comprar",
  "mediaHabits": "Redes sociales o plataformas donde pasa su tiempo",
  "preferredTone": "El tono de comunicación que mejor lo persuade (ej. Directo y basado en datos)",
  "triggerWords": "3 a 5 palabras clave separadas por comas que captan su atención al instante"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Use flash for speed
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2, // Keeps extraction somewhat creative but grounded
        responseMimeType: "application/json",
      }
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    if (uid) {
      await incrementTokens(uid, tokens);
    }

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    return JSON.parse(text) as Partial<BuyerPersona>;
  } catch (error) {
    console.error("Error generating persona from report:", error);
    throw error;
  }
}


export async function generateBrandStrategyFromReport(fullScanText: string, sysLang: string, uid?: string | null): Promise<any> {
  try {
    const prompt = `Actúa como un Director Creativo y Estratega de Contenido Senior. Tu tarea es leer el reporte de mercado de un negocio y desarrollar su Identidad de Voz (Brand Voice) y 4 Pilares de Contenido (Content Pillars).

REPORTE DE REFERENCIA:
${fullScanText}

REGLA CRÍTICA DE IDIOMA:
Debes generar TODO el contenido de los valores del JSON en el siguiente idioma: ${sysLang}. Sin embargo, las CLAVES (keys) del JSON deben permanecer exactamente como se definen abajo en inglés.

INSTRUCCIONES PARA BRAND VOICE:

'archetype': DEBE ser EXACTAMENTE uno de estos valores en inglés: 'The Hero', 'The Outlaw', 'The Explorer', 'The Creator', 'The Ruler', 'The Magician', 'The Lover', 'The Caregiver', 'The Jester', 'The Sage', 'The Innocent', 'The Everyman'.

Los valores de tono (formalityCasual, etc.) deben ser números del 0 al 100 donde 50 es neutral.

INSTRUCCIONES PARA CONTENT PILLARS:

Crea exactamente 4 pilares de contenido altamente relevantes.

'aiDirective' debe ser una instrucción clara para que futuras IAs sepan cómo escribir sobre este pilar.

FORMATO DE SALIDA (ESTRICTO JSON, sin etiquetas markdown):
{
"brandVoice": {
"valueProposition": "Propuesta de valor única y persuasiva en 1-2 oraciones",
"archetype": "Debe ser uno de los 12 arquetipos en inglés de la lista",
"formalityCasual": 50,
"authoritativeEmpathetic": 50,
"seriousPlayful": 50,
"vocabularyAllowlist": ["palabra1", "palabra2", "palabra3"],
"vocabularyBanlist": ["cliché1", "cliché2"]
},
"contentPillars": [
{
"name": "Nombre corto y pegadizo del pilar",
"coreTheme": "Descripción de 1 oración de lo que trata",
"keywords": ["keyword1", "keyword2"],
"aiDirective": "Instrucción de IA: 'Al escribir sobre este pilar, enfócate en...'",
"visualStyle": "Sugerencia de estilo visual"
}
]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
      }
    });

    const tokens = response.usageMetadata?.totalTokenCount ?? 0;
    if (uid) {
      await incrementTokens(uid, tokens);
    }

    const text = response.text;
    if (!text) throw new Error("Empty response from AI for Brand Strategy");

    return JSON.parse(text);
  } catch (error) {
    console.error("AI strategy generation error:", error);
    throw error;
  }
}
