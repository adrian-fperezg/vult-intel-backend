import { v4 as uuidv4 } from 'uuid';

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

// System instruction is now handled by the backend for security and consistency


export async function runFullScan(url: string, uid?: string | null, projectId?: string): Promise<Project> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required for deep scan.");

    const idToken = await user.getIdToken();
    const apiUrl = '/api/outreach/radar/deep-scan';

    console.log("-> scanService: Sending proxy request to backend for Deep Scan...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout for deep search

    const headers: Record<string, string> = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    };

    if (projectId) {
      headers['x-project-id'] = projectId;
    }

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ url })
      });
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError') throw new Error("Deep scan timed out. The search is taking longer than expected.");
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Scan failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data) throw new Error("No data returned from backend scan");

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

    // Token usage is now tracked on the backend, so we no longer call incrementUsage here
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
