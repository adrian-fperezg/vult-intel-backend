import { GoogleGenAI } from "@google/genai";
import type { ProjectSearchContext } from './projectContext.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const GOOGLE_SEARCH_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

// Domains that get a 'high' reputation badge
const HIGH_REPUTATION_DOMAINS = new Set([
  'techcrunch.com', 'wired.com', 'theverge.com', 'mit.edu', 'hbr.org',
  'mckinsey.com', 'gartner.com', 'forrester.com', 'wsj.com', 'ft.com',
  'bloomberg.com', 'reuters.com', 'apnews.com', 'bbc.com', 'nytimes.com',
  'forbes.com', 'inc.com', 'entrepreneur.com', 'harvard.edu', 'stanford.edu',
  'nature.com', 'science.org', 'thenextweb.com', 'venturebeat.com',
  'zdnet.com', 'arstechnica.com', 'infoq.com', 'smashingmagazine.com',
]);

// Domains that get a 'low' reputation badge
const LOW_REPUTATION_DOMAINS = new Set([
  'reddit.com', 'quora.com', 'medium.com', 'substack.com',
]);

export interface DiscoveredArticle {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  aiSummary: string;
  keywords: string[];
  relevanceScore: number;
  sourceReputation: 'high' | 'medium' | 'low';
  publishDate: string | null;
}

export interface DiscoveryInput {
  searchQueries: string[];
  manualSources: { domain_url: string }[];
  projectId: string;
  projectContext: ProjectSearchContext;
}

/**
 * Main discovery engine. Uses Google Custom Search when env vars are present,
 * falls back to Gemini + Google Search tool otherwise.
 */
export async function discoverArticles(input: DiscoveryInput): Promise<DiscoveredArticle[]> {
  const hasGoogleSearch = !!(GOOGLE_SEARCH_KEY && GOOGLE_SEARCH_ENGINE_ID);

  if (hasGoogleSearch) {
    console.log('[DISCOVERY] Using Google Custom Search API');
    return discoverWithCustomSearch(input);
  } else {
    console.log('[DISCOVERY] GOOGLE_SEARCH_API_KEY not set — falling back to Gemini Search Grounding');
    return discoverWithGeminiGrounding(input);
  }
}

// ─── PATH A: Google Custom Search ──────────────────────────────────────────

async function discoverWithCustomSearch(input: DiscoveryInput): Promise<DiscoveredArticle[]> {
  const { searchQueries, manualSources, projectContext } = input;
  const seenUrls = new Set<string>();
  const rawResults: { title: string; url: string; domain: string; snippet: string; publishDate: string | null }[] = [];

  // Run searches for AI-generated queries (up to 6)
  const queriesToRun = searchQueries.slice(0, 6);
  for (const query of queriesToRun) {
    try {
      const results = await googleCustomSearch(query, 5);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          rawResults.push(r);
        }
      }
    } catch (err) {
      console.warn(`[DISCOVERY] Search failed for query "${query}":`, err);
    }
  }

  // Run searches for manual domains
  for (const source of manualSources.slice(0, 4)) {
    const domain = source.domain_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const domainQuery = `site:${domain} ${projectContext.niche} ${new Date().getFullYear()}`;
    try {
      const results = await googleCustomSearch(domainQuery, 3);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          rawResults.push(r);
        }
      }
    } catch (err) {
      console.warn(`[DISCOVERY] Domain search failed for ${domain}:`, err);
    }
  }

  if (rawResults.length === 0) {
    console.warn('[DISCOVERY] No results from Google Custom Search, falling back to Gemini');
    return discoverWithGeminiGrounding(input);
  }

  // Batch enrich with Gemini
  const enriched = await enrichArticlesWithGemini(rawResults, projectContext);
  return enriched.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 20);
}

async function googleCustomSearch(
  query: string,
  num: number = 5
): Promise<{ title: string; url: string; domain: string; snippet: string; publishDate: string | null }[]> {
  const params = new URLSearchParams({
    key: GOOGLE_SEARCH_KEY!,
    cx: GOOGLE_SEARCH_ENGINE_ID!,
    q: query,
    num: String(Math.min(num, 10)),
    dateRestrict: 'm3', // last 3 months
    safe: 'active',
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Custom Search error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const items = data.items || [];

  return items.map((item: any) => {
    const url: string = item.link || '';
    const domain = extractDomain(url);
    return {
      title: item.title || '',
      url,
      domain,
      snippet: item.snippet || '',
      publishDate: item.pagemap?.metatags?.[0]?.['article:published_time'] || null,
    };
  });
}

// ─── PATH B: Gemini Search Grounding (fallback) ─────────────────────────────

async function discoverWithGeminiGrounding(input: DiscoveryInput): Promise<DiscoveredArticle[]> {
  const { projectContext, manualSources } = input;

  if (!GEMINI_KEY) {
    console.error('[DISCOVERY] No GEMINI_KEY available — cannot discover articles');
    return [];
  }

  const sourceUrls = manualSources.map(s => s.domain_url).join(', ');
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

  const systemInstruction = `You are a Senior Market Intelligence Analyst. Find the 10 most relevant and recent articles
for the given business. Focus on content published in the last 60 days.
Return ONLY valid JSON — no markdown, no explanation.`;

  const userPrompt = `Find the 10 most relevant articles for this business:

Project: ${projectContext.projectName}
Niche: ${projectContext.niche}
Description: ${projectContext.description}
Key Topics: ${projectContext.topics.join(', ') || 'General'}
Target Audience Pain Points: ${projectContext.painPoints.slice(0, 2).join('; ') || 'Not specified'}
Manual Sources to Check: ${sourceUrls || 'None — use general search'}

Return a JSON array:
[
  {
    "title": "Article title",
    "url": "https://...",
    "domain": "example.com",
    "snippet": "2-3 sentence executive summary",
    "aiSummary": "2-sentence actionable insight for a business owner",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "relevanceScore": 85,
    "publishDate": "2025-04-15"
  }
]`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      tools: [{ googleSearch: {} }],
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini Grounding API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleanText = rawText.replace(/```json\n?|```/g, '').trim();
  const articles = JSON.parse(cleanText) as any[];

  return articles.map((a: any) => ({
    title: a.title || '',
    url: a.url || '',
    domain: a.domain || extractDomain(a.url || ''),
    snippet: a.snippet || '',
    aiSummary: a.aiSummary || a.snippet || '',
    keywords: Array.isArray(a.keywords) ? a.keywords.slice(0, 5) : [],
    relevanceScore: typeof a.relevanceScore === 'number' ? Math.min(100, Math.max(0, a.relevanceScore)) : 70,
    sourceReputation: getReputation(a.domain || extractDomain(a.url || '')),
    publishDate: a.publishDate || null,
  }));
}

// ─── Gemini Batch Enrichment ────────────────────────────────────────────────

async function enrichArticlesWithGemini(
  rawArticles: { title: string; url: string; domain: string; snippet: string; publishDate: string | null }[],
  projectContext: ProjectSearchContext
): Promise<DiscoveredArticle[]> {
  if (!GEMINI_KEY || rawArticles.length === 0) {
    return rawArticles.map(a => ({
      ...a,
      aiSummary: a.snippet,
      keywords: [],
      relevanceScore: 50,
      sourceReputation: getReputation(a.domain),
    }));
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const results: DiscoveredArticle[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < rawArticles.length; i += BATCH_SIZE) {
    const batch = rawArticles.slice(i, i + BATCH_SIZE);

    try {
      const prompt = `You are an expert content analyst. Evaluate each article's relevance for a business in the "${projectContext.niche}" space.

Business context: ${projectContext.description}
Target audience: ${projectContext.targetAudience || 'Business professionals'}

For each article, provide:
- aiSummary: 2-sentence actionable insight for this business owner
- keywords: 3-5 relevant hashtags (without #)
- relevanceScore: 0-100 score based on relevance to the business's niche and audience

Articles to analyze:
${batch.map((a, idx) => `${idx + 1}. Title: "${a.title}"\n   URL: ${a.url}\n   Snippet: "${a.snippet}"`).join('\n\n')}

Return JSON array (same order as input):
[{"aiSummary": "...", "keywords": [...], "relevanceScore": 85}, ...]`;

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: 'Return ONLY a JSON array. No markdown. No explanation.',
        },
      });

      const raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
      const cleaned = raw.replace(/```json\n?|```/g, '').trim();
      const enrichments = JSON.parse(cleaned) as { aiSummary: string; keywords: string[]; relevanceScore: number }[];

      batch.forEach((article, idx) => {
        const enrichment: { aiSummary?: string; keywords?: string[]; relevanceScore?: number } = enrichments[idx] || {};
        results.push({
          ...article,
          aiSummary: enrichment.aiSummary || article.snippet,
          keywords: Array.isArray(enrichment.keywords) ? enrichment.keywords.slice(0, 5) : [],
          relevanceScore: typeof enrichment.relevanceScore === 'number'
          ? Math.min(100, Math.max(0, enrichment.relevanceScore!))
            : 50,
          sourceReputation: getReputation(article.domain),
        });
      });
    } catch (err) {
      console.warn(`[DISCOVERY] Enrichment batch ${i}–${i + BATCH_SIZE} failed:`, err);
      // Push with defaults so articles are not lost
      batch.forEach(article => {
        results.push({
          ...article,
          aiSummary: article.snippet,
          keywords: [],
          relevanceScore: 50,
          sourceReputation: getReputation(article.domain),
        });
      });
    }
  }

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

function getReputation(domain: string): 'high' | 'medium' | 'low' {
  const d = domain.replace(/^www\./, '');
  if (HIGH_REPUTATION_DOMAINS.has(d)) return 'high';
  if (LOW_REPUTATION_DOMAINS.has(d)) return 'low';
  return 'medium';
}
