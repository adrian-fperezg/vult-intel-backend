import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AuthRequest } from '../../middleware.js';
import db from '../../db.js';
import { 
  domainSearch, 
  emailFinder, 
  emailVerifier, 
  getAccountInformation, 
  discoverCompanies 
} from '../../lib/outreach/hunter.js';
import { searchPDL } from '../../lib/outreach/pdl.js';
import crypto from 'crypto';

interface PersonLead {
  id: string;
  type: 'person';
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  title: string;
  department: string;
  seniority: string;
  confidence: number;
  company: string;
  domain: string;
  industry: string;
  companySize: string;
  country: string;
  city: string;
  linkedinUrl: string;
  twitter: string;
  phone: string;
  technologies: string[];
  source: 'pdl' | 'hunter';
  selected: boolean;
  status: 'new' | 'saved' | 'enrolled';
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const batches = [];
  for (let i = 0; i < items.length; i += concurrency) {
    batches.push(items.slice(i, i + concurrency));
  }
  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

const router = express.Router();

// ─── DEBUG ROUTE ─────────────────────────────────────────────────────────────
router.get("/test", (req, res) => {
  res.json({ ok: true, message: 'Hunter router is mounted and reachable' });
});

// ─── CORE HUNTER ROUTES ───────────────────────────────────────────────────────

router.post("/discover", async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.uid;
    const { project_id, projectId, query, keywords, industry, sizeRange, country, city, technology, limit, filters } = req.body;
    const pId = project_id || projectId;

    if (!userId) return res.status(401).json({ error: "Auth required" });

    console.log('[Hunter Discover] Request body:', JSON.stringify(req.body));
    console.log('[Hunter Discover] projectId:', pId);

    // Merge everything into a filters object for the library call
    const combinedFilters = {
      ...(filters || {}),
      query: query || keywords,
      industry,
      size_range: sizeRange,
      country,
      city,
      technology,
      limit
    };

    const result = await discoverCompanies(pId, userId, combinedFilters);
    console.log('[Hunter Discover] Result count:', result?.companies?.length);
    res.json(result);
  } catch (error: any) {
    console.error('[Hunter Discover] ERROR:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

router.post("/search-people", async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.uid;
    const { project_id, projectId, filters, limit = 10 } = req.body;
    const pId = project_id || projectId;

    if (!userId) return res.status(401).json({ error: "Auth required" });

    console.log('[Search People] Starting pipeline for project:', pId);

    // Step 1: Discover Businesses (Hunter Discover)
    const discoveryResult = await discoverCompanies(pId, userId, filters);
    const companies = discoveryResult?.companies || [];
    
    if (companies.length === 0) {
      return res.json({ people: [], companies: 0, status: 'no_companies_found' });
    }

    console.log(`[Search People] Step 1 Complete: Found ${companies.length} companies.`);

    // Step 2: Search People at each Domain
    // We run this with controlled concurrency to avoid hitting rate limits
    const allPeople: PersonLead[] = [];
    const domains = companies.map((c: any) => c.domain).filter(Boolean);

    const personResults = await runWithConcurrency(domains, 3, async (domain: string) => {
      const f = filters as any;
      return await searchPeopleAtDomain(pId as string, userId as string, domain, {
        department: f?.department,
        seniority: f?.seniority?.[0], // Hunter/PDL take string seniority
      });
    });

    personResults.forEach(people => allPeople.push(...people));

    console.log(`[Search People] Pipeline complete: ${allPeople.length} unique people found across ${companies.length} companies.`);

    res.json({
      people: allPeople,
      metadata: {
        companiesProcessed: companies.length,
        totalFound: allPeople.length,
        sourceBreakdown: {
          pdl: allPeople.filter(p => p.source === 'pdl').length,
          hunter: allPeople.filter(p => p.source === 'hunter').length,
        }
      }
    });

  } catch (error: any) {
    console.error('[Search People] Pipeline ERROR:', error.message);
    res.status(500).json({ error: error.message });
  }
});

async function searchPeopleAtDomain(projectId: string, userId: string, domain: string, options: any): Promise<PersonLead[]> {
  try {
    // Try PDL first (if API key exists)
    const pdlResults = await searchPDL(projectId, {
      domain,
      department: options.department,
      seniority: options.seniority,
      limit: 5
    });

    if (pdlResults.length > 0) return pdlResults;

    // Fallback to Hunter Domain Search
    const hunterData = await domainSearch(projectId, userId, domain, {
      type: 'personal',
      seniority: options.seniority,
      department: options.department,
      limit: 10
    });

    if (!hunterData?.emails || hunterData.emails.length === 0) return [];

    return hunterData.emails.map((e: any) => ({
      id: crypto.randomUUID(),
      type: 'person' as const,
      firstName: e.first_name || '',
      lastName: e.last_name || '',
      fullName: [e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unknown',
      email: e.value || '',
      title: e.position || '',
      department: e.department || '',
      seniority: e.seniority || '',
      confidence: e.confidence || 0,
      company: hunterData.organization || '',
      domain: domain,
      industry: '',
      companySize: '',
      country: '',
      city: '',
      linkedinUrl: e.linkedin || '',
      twitter: e.twitter || '',
      phone: e.phone_number || '',
      technologies: [],
      source: 'hunter' as const,
      selected: true,
      status: 'new' as const,
    }));

  } catch (err: any) {
    console.error(`[Search People @ ${domain}] Error:`, err.message);
    return [];
  }
}

router.post("/domain-search", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, projectId, domain, options } = req.body;
  const pId = project_id || projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const data = await domainSearch(pId, userId, domain, options || {});
    res.json(data);
  } catch (error: any) {
    console.error('[HUNTER_API_ERROR]:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/email-finder", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, projectId, domain, first_name, last_name } = req.body;
  const pId = project_id || projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const data = await emailFinder(pId, userId, domain, first_name, last_name);
    res.json(data);
  } catch (error: any) {
    console.error('[HUNTER_API_ERROR]:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/email-verifier", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, projectId, email } = req.body;
  const pId = project_id || projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const data = await emailVerifier(pId, userId, email);
    res.json(data);
  } catch (error: any) {
    console.error('[HUNTER_API_ERROR]:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/account", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, projectId } = req.query as { project_id?: string, projectId?: string };
  const pId = project_id || projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const data = await getAccountInformation(pId);
    res.json(data);
  } catch (error: any) {
    console.error('[HUNTER_API_ERROR]:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/ai-extract", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, projectId, prompt, icpContext } = req.body;
  const pId = project_id || projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    let text = "";

    if (GEMINI_KEY) {
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `User Request: ${prompt}\n\nExisting ICP Context for this project:\n${JSON.stringify(icpContext || {})}`,
        config: {
          systemInstruction: `You are a Lead Generation Parameter Extractor for Hunter.io. 
          Analyze the user request and extract specific search parameters. 
          Use the provided ICP context to fill in gaps if the user request is vague.
          
          Return ONLY a RAW JSON object with:
          - searchType: "company_discovery" (general search) or "domain_search" (specific domain/person)
          - confidence: number (0-100)
          - reasoning: string (brief explanation of why these parameters were chosen)
          - params: {
              jobTitles: string[] (array of specific roles, e.g. ["CEO", "Founder"]),
              industries: string[] (array of industries, e.g. ["SaaS", "Real Estate"]),
              seniority: string[] (array of levels: "junior", "senior", "manager", "director", "executive"),
              keywords: string (fallback query),
              sizeRange: string (e.g. "11,50" or "501,1000"),
              country: string,
              revenue: string (e.g. "$1M-$10M" or "Targeting high revenue")
            }
          
          ALWAYS return arrays for jobTitles, industries, and seniority, even if there is only one item.
          DO NOT include any Markdown formatting or backticks.`
        }
      });
      text = response.text || "";
    } else if (ANTHROPIC_KEY) {
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
      const response = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1000,
        temperature: 0,
        system: `You are a Lead Generation Parameter Extractor for Hunter.io.`,
        messages: [{ role: "user", content: prompt }],
      });
      text = (response.content[0] as any).text;
    } else {
      throw new Error("No AI API keys configured (Gemini or Anthropic required)");
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    res.json(data);
  } catch (error: any) {
    console.error("[HUNTER_AI_EXTRACT_ERROR]:", error.message);
    res.status(500).json({ error: error.message || "Failed to extract parameters" });
  }
});

router.get("/saved-searches", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, projectId } = req.query as { project_id?: string, projectId?: string };
  const pId = project_id || projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const searches = await db.all(`
      SELECT * FROM outreach_saved_searches 
      WHERE project_id = ? 
      ORDER BY created_at DESC
    `, pId);
    res.json(searches);
  } catch (error: any) {
    console.error('[HUNTER_SAVED_SEARCHES_ERROR]:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/saved-searches/:id", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  try {
    const leads = await db.all(`
      SELECT * FROM outreach_saved_search_leads 
      WHERE search_id = ?
    `, req.params.id);
    res.json(leads);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/save-search", async (req: AuthRequest, res) => {
  const userId = req.user?.uid;
  const { project_id, projectId, query, extracted_params, leads } = req.body;
  const pId = project_id || projectId;

  if (!userId) return res.status(401).json({ error: "Auth required" });

  const searchId = uuidv4();
  try {
    await db.transaction(async (tx) => {
      await tx.run(`
        INSERT INTO outreach_saved_searches (id, project_id, user_id, query, extracted_params, results_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `, searchId, pId, userId, query || 'Manual Search', JSON.stringify(extracted_params || {}), leads?.length || 0);

      if (leads && leads.length > 0) {
        for (const lead of leads) {
          await tx.run(`
            INSERT INTO outreach_saved_search_leads (id, search_id, email, first_name, last_name, position, confidence, verification_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, uuidv4(), searchId, lead.email, lead.first_name || '', lead.last_name || '', lead.position || '', lead.confidence || 0, lead.verification_status || '');
        }
      }
    });

    res.json({ success: true, searchId });
  } catch (error: any) {
    console.error("[HUNTER_SAVE_SEARCH_ERROR]:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
