import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';

// Initialize Gemini
// Note: In a real app, you should not expose the API key in the client-side code like this if possible, 
// but for this preview environment, we use the injected process.env.GEMINI_API_KEY.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { saveBuyerPersona } from './brandStrategyService';
import { incrementUsage } from './ai';
import { safeJsonParse } from '../utils/jsonUtils';
import { getLanguageDirective } from '../utils/aiLanguageUtils';

export interface MarketingTask {
  id: string;
  task: string;
  category: string;
  impact: 'High' | 'Medium' | 'Low';
  completed: boolean;
}

export interface WorkflowField {
  id: string;
  label: string;
  value: string;
  type: 'text' | 'textarea' | 'select' | 'number';
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  type: string;
  fields: WorkflowField[];
  customFields: WorkflowField[];
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  url: string;
  niche: string;
  description: string;
  lastScan: string;
  region: string;
  image: string;
  scores: {
    website: number;
    marketing: number;
  };
  competitors?: string[];
  marketingChecklist: MarketingTask[];
  sections: {
    id: string;
    title: string;
    summary: string;
    content: string; // Markdown content
    pages?: {
      path: string;
      type: string;
      discoveryDate: string;
      seoReport: string;
    }[];
  }[];
  workflows?: WorkflowDefinition[];
}

const SYSTEM_INSTRUCTION = `
Actúa como un Director de Crecimiento (Head of Growth) y Analista de Mercado Senior.
El usuario ha solicitado un escaneo profundo de mercado para una URL o negocio.

INSTRUCCIONES CRÍTICAS DE INVESTIGACIÓN (¡Usa Google Search!):
DEBES buscar en internet información real, actual y verificable sobre la empresa, su tráfico estimado, su posicionamiento, sus competidores directos y sus brechas de mercado. NO inventes estadísticas. Si un dato no es público, deduce su rendimiento basándote en su presencia digital, calidad de contenido y SEO técnico. 

INSTRUCCIONES DE MARKETING PARA EL "FULL SCAN REPORT":
El reporte debe ser un análisis crudo y de alto nivel enfocado puramente en CRECIMIENTO y CONVERSIÓN. No des consejos genéricos ("publica más en redes"). Entrega estrategias tácticas, oportunidades de palabras clave específicas y acciones de alto impacto.

FORMATO DE SALIDA (JSON ESTRICTO):
Devuelve ÚNICAMENTE un objeto JSON válido con las siguientes claves exactas. TODO el contenido de las secciones debe estar en formato MARKDOWN profesional.

1. "marketingImprovements": Listado detallado de mejoras de marketing detectadas (objeto similar al marketingChecklist anterior).
2. "executiveSummary": Resumen ejecutivo de alto nivel sobre el estado actual del negocio.
3. "businessSnapshot": Análisis rápido del modelo de negocio, propuesta de valor y posicionamiento.
4. "audienceAndPositioning": Definición de audiencias objetivo, buyer personas y cómo se posiciona la marca frente a ellas.
5. "channelsAndPresence": Auditoría de redes sociales, canales de tráfico y presencia digital global.
6. "siteArchitecture": Análisis de la estructura del sitio, jerarquía de información y flujo del usuario.
7. "discoveredPagesAndSeoAudit": Lista de páginas detectadas y hallazgos críticos de SEO técnico y on-page.
8. "contentAudit": Evaluación de la calidad, tono y efectividad del contenido actual.
9. "seoPerformance": Análisis de rendimiento en buscadores, keywords orgánicas y autoridad.
10. "conversionAndUx": Auditoría de user experience enfocada en embudos de conversión y fricción.
11. "techStack": Listado y análisis de las tecnologías detectadas (CMS, Analytics, CRM, etc.).
12. "quickWins7Days": 3-5 Acciones inmediatas de alto impacto que se pueden ejecutar en una semana.
13. "actionPlan30Days": Roadmap estratégico para los próximos 30 días con hitos claros.

Estructura JSON Requerida:
{
  "project": {
    "name": "Company Name",
    "niche": "Industry/Niche",
    "description": "A brief 1-2 sentence description.",
    "region": "Primary Region",
    "image": "https://logo.clearbit.com/[domain]"
  },
  "scores": {
    "website": 0-100,
    "marketing": 0-100
  },
  "competitors": ["domain1.com", "domain2.com"],
  "marketingChecklist": [
    { "id": "t1", "task": "Task description", "category": "SEO", "impact": "High", "completed": false }
  ],
  "reportSections": {
    "marketingImprovements": "Markdown content...",
    "executiveSummary": "Markdown content...",
    "businessSnapshot": "Markdown content...",
    "audienceAndPositioning": "Markdown content...",
    "channelsAndPresence": "Markdown content...",
    "siteArchitecture": "Markdown content...",
    "discoveredPagesAndSeoAudit": "Markdown content...",
    "contentAudit": "Markdown content...",
    "seoPerformance": "Markdown content...",
    "conversionAndUx": "Markdown content...",
    "techStack": "Markdown content...",
    "quickWins7Days": "Markdown content...",
    "actionPlan30Days": "Markdown content..."
  },
  "buyerPersonas": [...]
}

INSTRUCCIÓN SOBRE EL NICHO:
Debes identificar el NICHO exacto basado únicamente en el contenido del sitio web. No inventes una categoría si no estás seguro, pero describe el sector principal de actividad.
`;

export async function runFullScan(url: string, uid?: string | null): Promise<Project> {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`;

    console.log("-> scanService: Sending fetch request to Gemini API with Tools...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION + "\n" + getLanguageDirective() }] },
          generationConfig: { responseMimeType: "application/json" },
          tools: [{ googleSearch: {} }],
          contents: [{ role: "user", parts: [{ text: `Analyze the following website URL: ${url}. Use Google Search to find real information about their services, target audience, and current digital presence. DO NOT hallucinate info.` }] }]
        })
      });
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError') throw new Error("Request timed out.");
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const responseData = await response.json();
    const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response from Gemini");

    const data = safeJsonParse(text);

    // Map new reportSections to Project sections format
    const sectionKeys: Record<string, string> = {
      executiveSummary: "Executive Summary",
      businessSnapshot: "Business Snapshot",
      audienceAndPositioning: "Audience & Positioning",
      channelsAndPresence: "Channels & Presence",
      siteArchitecture: "Site Architecture",
      discoveredPagesAndSeoAudit: "Discovered Pages & SEO Audit",
      contentAudit: "Content Audit",
      seoPerformance: "SEO Performance",
      conversionAndUx: "Conversion & UX",
      techStack: "Tech Stack",
      quickWins7Days: "Quick Wins (7 Days)",
      actionPlan30Days: "Action Plan (30 Days)"
    };

    const parsedSections = Object.entries(sectionKeys).map(([key, title]) => {
      const content = data.reportSections?.[key] || data[key] || ""; // Support both nested or flat for robustness
      const safeId = key.replace(/([A-Z])/g, "-$1").toLowerCase();

      return {
        id: safeId,
        title: title,
        summary: `Analytical insights for ${title}`,
        content: content || "_No data detected during this scan._",
      };
    });

    const projectId = uuidv4();

    if (data.buyerPersonas && Array.isArray(data.buyerPersonas) && uid) {
      data.buyerPersonas.forEach((p: any) => {
        saveBuyerPersona(projectId, { ...p, projectId }).catch(console.error);
      });
    }

    const project: Project = {
      id: projectId,
      url: url,
      lastScan: new Date().toISOString(),
      name: data.project?.name || "Unknown project",
      niche: data.project?.niche || "Unknown niche",
      description: data.project?.description || "",
      region: data.project?.region || "Global",
      image: data.project?.image || `https://logo.clearbit.com/${url}`,
      scores: data.scores || { website: 0, marketing: 0 },
      competitors: data.competitors || [],
      marketingChecklist: data.marketingChecklist || data.marketingImprovements || [],
      sections: parsedSections,
      workflows: []
    };

    incrementUsage(uid, 'deepScansGenerated', 1).catch(console.error);
    return project;

  } catch (error) {
    console.error("Error running full scan:", error);
    throw error;
  }
}

// Firebase Firestore Helper
export async function saveProject(project: Project) {
  console.log("-> scanService: saveProject called. Checking auth...");

  // PROACTIVE LOCAL CACHE: Save to localStorage IMMEDIATELY so navigation finds it without refresh
  try {
    const projectWithUser = { ...project, userId: auth.currentUser?.uid || 'anonymous' };
    localStorage.setItem(`fallback_project_${project.id}`, JSON.stringify(projectWithUser));
    localStorage.setItem('activeProjectId', project.id);
    console.log("-> scanService: Proactive local cache saved.");
  } catch (e) {
    console.error("-> scanService: Error saving proactive cache", e);
  }

  if (!auth.currentUser) {
    console.warn("User must be logged in to save projects to Firestore");
    return;
  }

  console.log(`-> scanService: User authenticated. Saving to customers/${auth.currentUser.uid}/projects/${project.id}...`);
  const projectRef = doc(db, 'customers', auth.currentUser.uid, 'projects', project.id);

  // Firestore setDoc can hang indefinitely if the client is offline or a firewall blocks the connection
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error("FIRESTORE_TIMEOUT")), 15000);
  });

  try {
    await Promise.race([
      setDoc(projectRef, { ...project, userId: auth.currentUser.uid }, { merge: true }),
      timeoutPromise
    ]);
    console.log("-> scanService: saveProject finished successfully in Firestore.");
  } catch (error: any) {
    console.error("-> scanService: Firestore save error:", error);
    if (error.message === "FIRESTORE_TIMEOUT" || error.code === "unavailable") {
      console.warn("-> scanService: Network block detected. Local fallback already exists.");
      return;
    }
    throw error;
  }
}

export async function updateProject(project: Project) {
  await saveProject(project);
}

export async function getProjects(): Promise<Project[]> {
  if (!auth.currentUser) return [];

  const projects: Project[] = [];

  // Firestore getDocs can hang if the client is offline or blocked
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error("FIRESTORE_TIMEOUT")), 3000); // 3s timeout for listing
  });

  try {
    const q = query(collection(db, 'customers', auth.currentUser.uid, 'projects'));
    const querySnapshot = await Promise.race([
      getDocs(q),
      timeoutPromise
    ]) as any;

    if (querySnapshot && typeof querySnapshot.forEach === 'function') {
      querySnapshot.forEach((doc: any) => {
        projects.push(doc.data() as Project);
      });
    }
  } catch (error) {
    console.warn("-> scanService: Failed to fetch projects from Firestore. Proceeding with localStorage only.", error);
  }

  // Load fallback projects from localStorage
  const fallbackProjects: Project[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('fallback_project_')) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsedItem = JSON.parse(item) as Project & { userId?: string };
          // Only include it if it belongs to the current user (or if it's an old item without a userId)
          if (!parsedItem.userId || parsedItem.userId === auth.currentUser.uid) {
            fallbackProjects.push(parsedItem);
          }
        }
      }
    }
  } catch (e) {
    console.error("-> scanService: Error reading localStorage", e);
  }

  // Merge projects, prioritizing Firestore over localStorage if there are duplicates
  const allProjects = [...projects];
  for (const fp of fallbackProjects) {
    if (!allProjects.some(p => p.id === fp.id)) {
      allProjects.push(fp);
    }
  }

  // Sort projects by date descending
  allProjects.sort((a, b) => new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime());

  // Backfill marketingChecklist if missing
  return allProjects.map(p => {
    if (!p.marketingChecklist || p.marketingChecklist.length === 0) {
      return {
        ...p,
        marketingChecklist: [
          { id: '1', task: 'Optimize H1 tags for primary keywords', category: 'SEO', impact: 'High', completed: false },
          { id: '2', task: 'Add schema markup for local business', category: 'SEO', impact: 'High', completed: false },
          { id: '3', task: 'Compress homepage hero image', category: 'Performance', impact: 'Medium', completed: false },
          { id: '4', task: 'Setup Google Analytics 4 conversion events', category: 'Analytics', impact: 'High', completed: false },
          { id: '5', task: 'Create lead magnet for email capture', category: 'Marketing', impact: 'High', completed: false },
        ]
      };
    }
    return p;
  });
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  if (!auth.currentUser) return undefined;

  const projectRef = doc(db, 'customers', auth.currentUser.uid, 'projects', id);

  // Firestore getDoc can hang indefinitely if the client is offline or a firewall blocks the connection
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error("FIRESTORE_TIMEOUT")), 5000); // 5s timeout for fetching
  });

  try {
    const docSnap = await Promise.race([
      getDoc(projectRef),
      timeoutPromise
    ]) as any;

    if (docSnap && docSnap.exists()) {
      return docSnap.data() as Project;
    }
  } catch (error) {
    console.warn("-> scanService: Failed to fetch from Firestore. Checking localStorage fallback.", error);
  }

  // Check LocalStorage Fallback
  const localProjectStr = localStorage.getItem(`fallback_project_${id}`);
  if (localProjectStr) {
    console.log("-> scanService: Successfully loaded project from localStorage fallback.");
    return JSON.parse(localProjectStr) as Project;
  }

  return undefined;
}

export async function deleteProject(id: string): Promise<void> {
  if (!auth.currentUser) return;

  const projectRef = doc(db, 'customers', auth.currentUser.uid, 'projects', id);
  await deleteDoc(projectRef);
}
