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
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
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
              country: string
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
    await db.transaction(async () => {
      await db.run(`
        INSERT INTO outreach_saved_searches (id, project_id, user_id, query, extracted_params, results_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `, searchId, pId, userId, query || 'Manual Search', JSON.stringify(extracted_params || {}), leads?.length || 0);

      if (leads && leads.length > 0) {
        for (const lead of leads) {
          await db.run(`
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
