import { v4 as uuidv4 } from "uuid";
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

async function executeRequestWithRetry(url: string, params: Record<string, string>, retries = 3): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    await throttle();
    
    const query = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${query}`;
    
    const res = await fetch(fullUrl);
    
    if (res.status === 429) {
       // Rate limit exceeded
       attempt++;
       const backoff = Math.pow(2, attempt) * 1000;
       await new Promise((resolve) => setTimeout(resolve, backoff));
       continue;
    }
    
    const data = await res.json();
    if (!res.ok) {
       throw new Error(data.errors?.[0]?.details || "Hunter API Error");
    }
    return data.data;
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
    // Remove undefined values
    const cleanOptions = Object.fromEntries(Object.entries(options).filter(([_, v]) => v != null)) as Record<string, string>;
    const params = { domain, api_key: apiKey, ...cleanOptions };
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
    const params = { domain, first_name: firstName, last_name: lastName, api_key: apiKey };
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
    const params = { email, api_key: apiKey };
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
    const apiKey = await getApiKey(projectId);
    if (!apiKey) throw new Error("Hunter API key is missing or invalid");

    // Remove undefined/null values
    const cleanFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v != null && v !== '')
    ) as Record<string, string>;

    const params = { ...cleanFilters, api_key: apiKey };
    
    console.log(`[Hunter Lib] Calling /companies/search with params:`, JSON.stringify({ ...params, api_key: '***' }));
    
    const data = await executeRequestWithRetry(`${HUNTER_API_URL}/companies/search`, params);
    
    logUsage(projectId, userId, 'discover', 1, 'success');
    return data;
  } catch (err: any) {
    console.error(`[Hunter Lib] Discover Error:`, err.message);
    logUsage(projectId, userId, 'discover', 0, 'error');
    throw err;
  }
}

export async function getAccountInformation(projectId: string) {
  const apiKey = await getApiKey(projectId);
  const data = await executeRequestWithRetry(`${HUNTER_API_URL}/account`, { api_key: apiKey });
  return data;
}
