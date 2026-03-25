import { v4 as uuidv4 } from "uuid";
import { GoogleGenAI } from "@google/genai";
import db from "../../db.js";
import { decryptToken } from "../../oauth.js";

const HUNTER_API_URL = "https://api.hunter.io/v2";

// Throttling: max 5 req/sec
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 200;

async function throttle() {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - timeSinceLast));
  }
  lastRequestTime = Date.now();
}

async function getApiKey(projectId?: string): Promise<string> {
  if (projectId) {
    const row = await db.prepare("SELECT hunter_api_key FROM outreach_settings WHERE project_id = ?").get(projectId) as any;
    if (row && row.hunter_api_key) {
      return decryptToken(row.hunter_api_key);
    }
  }
  
  const envKey = process.env.HUNTER_API_KEY || process.env.HUNTER_API_KEY_MASTER;
  if (envKey) {
    return envKey;
  }
  
  throw new Error("No Hunter.io API key configured. Please add one in Settings or contact an administrator.");
}

async function executeRequestWithRetry(url: string, params: URLSearchParams, retries = 3): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    await throttle();
    
    const fullUrl = `${url}?${params.toString()}`;
    console.log(`[Hunter Lib] Sending GET to: ${fullUrl.split('api_key=')[0]}api_key=***`);
    
    const res = await fetch(fullUrl, { method: 'GET' });
    
    if (res.status === 429) {
       attempt++;
       const backoff = Math.pow(2, attempt) * 1000;
       await new Promise((resolve) => setTimeout(resolve, backoff));
       continue;
    }
    
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      throw new Error(`Hunter API returned non-JSON: ${res.status} ${text.substring(0, 100)}`);
    }

    const data = await res.json();
    if (!res.ok) {
       throw new Error(data.errors?.[0]?.details || data.message || "Hunter API Error");
    }
    return data.data || data;
  }
  throw new Error("Hunter API rate limit exceeded after retries.");
}

function logUsage(projectId: string, userId: string, endpoint: string, credits: number, status: string) {
  db.prepare(`
    INSERT INTO hunter_usage_log (id, project_id, user_id, endpoint, credits_used, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), projectId, userId, endpoint, credits, status);
}

export async function domainSearch(projectId: string, userId: string, domain: string, options: any = {}) {
  try {
    const apiKey = await getApiKey(projectId);
    const params = new URLSearchParams();
    params.append('domain', domain);
    params.append('api_key', apiKey);
    Object.entries(options).forEach(([k, v]) => {
      if (v != null) params.append(k, String(v));
    });

    const data = await executeRequestWithRetry(`${HUNTER_API_URL}/domain-search`, params);
    
    logUsage(projectId, userId, 'domain-search', 1, 'success');
    return data;
  } catch (err: any) {
    logUsage(projectId, userId, 'domain-search', 0, 'error');
    throw err;
  }
}

export async function emailFinder(projectId: string, userId: string, domain: string, firstName: string, lastName: string) {
  try {
    const apiKey = await getApiKey(projectId);
    const params = new URLSearchParams();
    params.append('domain', domain);
    params.append('first_name', firstName);
    params.append('last_name', lastName);
    params.append('api_key', apiKey);
    const data = await executeRequestWithRetry(`${HUNTER_API_URL}/email-finder`, params);
    
    logUsage(projectId, userId, 'email-finder', 1, 'success');
    return data;
  } catch (err: any) {
    logUsage(projectId, userId, 'email-finder', 0, 'error');
    throw err;
  }
}

export async function emailVerifier(projectId: string, userId: string, email: string) {
  try {
    const apiKey = await getApiKey(projectId);
    const params = new URLSearchParams();
    params.append('email', email);
    params.append('api_key', apiKey);
    const data = await executeRequestWithRetry(`${HUNTER_API_URL}/email-verifier`, params);
    
    logUsage(projectId, userId, 'email-verifier', 1, 'success');
    return data;
  } catch (err: any) {
    logUsage(projectId, userId, 'email-verifier', 0, 'error');
    throw err;
  }
}

export async function discoverCompanies(projectId: string, userId: string, filters: any = {}) {
  try {
    const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!GEMINI_KEY) throw new Error("Gemini API key is missing. Please check server environment.");

    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    
    // Construct search criteria string
    const criteria = [
      filters.query || filters.keywords ? `Keywords: ${filters.query || filters.keywords}` : null,
      filters.industry ? `Industry: ${filters.industry}` : null,
      filters.size_range || filters.sizeRange || filters.headcount ? `Size: ${filters.size_range || filters.sizeRange || filters.headcount}` : null,
      filters.country ? `Country: ${filters.country}` : null,
      filters.city ? `City: ${filters.city}` : null
    ].filter(Boolean).join(", ");

    console.log(`[AI Discover] Generating companies for: ${criteria}`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a B2B data researcher. Return a JSON array of real companies that match these filters: ${criteria || 'General search'}. 
      
      Return strictly a JSON object with a 'companies' array. 
      Each company must have: 
      - id (string, uuid)
      - name (string)
      - domain (string, lowercase, example.com)
      - industry (string)
      - size (string, e.g. "11-50")
      - country (string)
      - description (string, 1-2 sentences about what they do)

      Only return real, existing companies. Limit to 20 results.`,
      config: {
        systemInstruction: "Return ONLY a RAW JSON object. DO NOT include any Markdown formatting or backticks. Ensure valid JSON syntax."
      }
    });

    const text = response.text || "";
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    let data;
    try {
      data = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error("[AI Discover] JSON Parse Error. Raw text:", text);
      throw new Error("Failed to parse AI response. The results might be malformed.");
    }

    // Normalize and add logos
    if (data.companies && Array.isArray(data.companies)) {
      data.companies = data.companies.map((c: any) => ({
        ...c,
        id: c.id || uuidv4(),
        logo: `https://logo.clearbit.com/${c.domain}`
      }));
    } else {
      data.companies = [];
    }

    logUsage(projectId, userId, 'discover-ai', 0, 'success');
    return data;
  } catch (err: any) {
    console.error(`[Hunter Lib] AI Discover Error:`, err.message);
    logUsage(projectId, userId, 'discover-ai', 0, 'error');
    throw err;
  }
}

export async function getAccountInformation(projectId: string) {
  const apiKey = await getApiKey(projectId);
  const params = new URLSearchParams();
  params.append('api_key', apiKey);
  const data = await executeRequestWithRetry(`${HUNTER_API_URL}/account`, params);
  return data;
}
