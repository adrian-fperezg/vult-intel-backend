import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    query,
    orderBy,
    where,
    serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

// ─── Content Pillars ────────────────────────────────────────────────────────

export interface ContentPillar {
    id: string;
    projectId: string;
    userId: string;
    name: string;
    coreTheme: string;
    keywords: string[];
    aiDirective: string;
    visualStyle?: string;
    createdAt: number;
}

const PILLARS_COLLECTION = 'contentPillars';
const MAX_PILLARS = 7;

export const saveContentPillar = async (
    projectId: string,
    pillar: Omit<ContentPillar, 'id' | 'createdAt' | 'userId' | 'projectId'>
): Promise<string> => {
    const existing = await getContentPillars(projectId);
    if (existing.length >= MAX_PILLARS) {
        throw new Error(`Maximum of ${MAX_PILLARS} content pillars reached for this project.`);
    }
    if (!auth.currentUser) throw new Error('User must be authenticated');
    const docRef = doc(collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${PILLARS_COLLECTION}`));
    await setDoc(docRef, {
        ...pillar,
        projectId,
        userId: auth.currentUser.uid,
        createdAt: Date.now(),
    });
    return docRef.id;
};

export const getContentPillars = async (projectId: string): Promise<ContentPillar[]> => {
    if (!auth.currentUser) return [];
    if (!auth.currentUser) return [];
    const q = query(
        collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${PILLARS_COLLECTION}`),
        orderBy('createdAt', 'asc')
    );
    const querySnapshot = await getDocs(q);
    const pillars: ContentPillar[] = [];
    querySnapshot.forEach((doc) => {
        pillars.push({ id: doc.id, ...doc.data() } as ContentPillar);
    });
    return pillars;
};

export const updateContentPillar = async (projectId: string, id: string, pillar: Partial<ContentPillar>): Promise<void> => {
    if (!auth.currentUser) return;
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${PILLARS_COLLECTION}`, id);
    await setDoc(docRef, { ...pillar, userId: auth.currentUser.uid }, { merge: true });
};

export const deleteContentPillar = async (projectId: string, id: string): Promise<void> => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${PILLARS_COLLECTION}`, id));
};

// ─── Buyer Personas ──────────────────────────────────────────────────────────

export interface BuyerPersona {
    id: string;
    projectId: string;
    userId: string;
    name: string;
    // Demographics
    ageRange: string;
    gender: string;
    location: string;
    jobTitle: string;
    income: string;
    // Psychographics
    goals: string;
    painPoints: string;
    objections: string;
    mediaHabits: string;
    // Voice cues
    preferredTone: string;
    triggerWords: string;
    createdAt: number;
}

const PERSONAS_COLLECTION = 'buyerPersonas';
const MAX_PERSONAS = 10;

export const saveBuyerPersona = async (
    projectId: string,
    persona: Omit<BuyerPersona, 'id' | 'createdAt' | 'userId'>
): Promise<string> => {
    const existing = await getBuyerPersonas(projectId);
    if (existing.length >= MAX_PERSONAS) {
        throw new Error(`Maximum of ${MAX_PERSONAS} buyer personas reached for this project.`);
    }

    if (!auth.currentUser) throw new Error('User must be authenticated');
    const docRef = doc(collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${PERSONAS_COLLECTION}`));
    await setDoc(docRef, {
        ...persona,
        projectId,
        userId: auth.currentUser.uid,
        createdAt: Date.now(),
    });
    return docRef.id;
};

export const getBuyerPersonas = async (projectId: string): Promise<BuyerPersona[]> => {
    if (!auth.currentUser) return [];
    if (!auth.currentUser) return [];
    const q = query(
        collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${PERSONAS_COLLECTION}`),
        orderBy('createdAt', 'asc')
    );
    const querySnapshot = await getDocs(q);
    const personas: BuyerPersona[] = [];
    querySnapshot.forEach((doc) => {
        personas.push({ id: doc.id, ...doc.data() } as BuyerPersona);
    });
    return personas;
};

export const updateBuyerPersona = async (projectId: string, id: string, persona: Partial<BuyerPersona>): Promise<void> => {
    if (!auth.currentUser) return;
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${PERSONAS_COLLECTION}`, id);
    await setDoc(docRef, { ...persona, userId: auth.currentUser.uid }, { merge: true });
};

export const deleteBuyerPersona = async (projectId: string, id: string): Promise<void> => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${PERSONAS_COLLECTION}`, id));
};

// ─── Brand Voice ─────────────────────────────────────────────────────────────

export const JUNGIAN_ARCHETYPES = [
    'The Hero', 'The Outlaw', 'The Explorer', 'The Creator', 'The Ruler',
    'The Magician', 'The Lover', 'The Caregiver', 'The Jester', 'The Sage',
    'The Innocent', 'The Everyman',
] as const;

export type Archetype = typeof JUNGIAN_ARCHETYPES[number];

export interface BrandVoice {
    id: string;
    projectId: string;
    userId: string;
    name: string;
    valueProposition: string;
    archetype: Archetype;
    // Tone sliders: 0–100
    formalityCasual: number;      // 0 = Very Formal, 100 = Very Casual
    authoritativeEmpathetic: number; // 0 = Very Authoritative, 100 = Very Empathetic
    seriousPlayful: number;       // 0 = Very Serious, 100 = Very Playful
    vocabularyAllowlist: string[];
    vocabularyBanlist: string[];
    updatedAt: number;
}

const VOICE_COLLECTION = 'brandVoice';
const MAX_VOICES = 10;

export const saveBrandVoice = async (projectId: string, voice: Omit<BrandVoice, 'id' | 'projectId' | 'updatedAt' | 'userId'>): Promise<string> => {
    const existing = await getBrandVoices(projectId);
    if (existing.length >= MAX_VOICES) {
        throw new Error(`Maximum of ${MAX_VOICES} brand voices reached for this project.`);
    }

    if (!auth.currentUser) throw new Error('User must be authenticated');
    const docRef = doc(collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${VOICE_COLLECTION}`));
    await setDoc(docRef, {
        ...voice,
        projectId,
        userId: auth.currentUser.uid,
        updatedAt: Date.now(),
    });
    return docRef.id;
};

export const getBrandVoices = async (projectId: string): Promise<BrandVoice[]> => {
    if (!auth.currentUser) return [];
    if (!auth.currentUser) return [];
    const q = query(
        collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${VOICE_COLLECTION}`),
        orderBy('updatedAt', 'asc')
    );
    const querySnapshot = await getDocs(q);
    const voices: BrandVoice[] = [];
    querySnapshot.forEach((doc) => {
        voices.push({ id: doc.id, ...doc.data() } as BrandVoice);
    });
    return voices;
};

export const updateBrandVoice = async (projectId: string, id: string, voice: Partial<BrandVoice>): Promise<void> => {
    if (!auth.currentUser) return;
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${VOICE_COLLECTION}`, id);
    await setDoc(docRef, { ...voice, userId: auth.currentUser.uid, updatedAt: Date.now() }, { merge: true });
};

export const deleteBrandVoice = async (projectId: string, id: string): Promise<void> => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${VOICE_COLLECTION}`, id));
};

// ─── Context Files ──────────────────────────────────────────────────────────

export interface ContextFile {
    id: string;
    projectId: string;
    userId: string;
    name: string;
    content: string;
    type: string;
    createdAt: number;
}

const CONTEXT_COLLECTION = 'contextFiles';

export const saveContextFile = async (projectId: string, file: Omit<ContextFile, 'id' | 'createdAt' | 'projectId' | 'userId'>): Promise<string> => {
    if (!auth.currentUser) throw new Error('User must be authenticated');
    const docRef = doc(collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${CONTEXT_COLLECTION}`));
    await setDoc(docRef, {
        ...file,
        projectId,
        userId: auth.currentUser.uid,
        createdAt: Date.now(),
    });
    return docRef.id;
};

export const getContextFiles = async (projectId: string): Promise<ContextFile[]> => {
    if (!auth.currentUser) return [];
    if (!auth.currentUser) return [];
    const q = query(
        collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${CONTEXT_COLLECTION}`),
        orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const files: ContextFile[] = [];
    querySnapshot.forEach((doc) => {
        files.push({ id: doc.id, ...doc.data() } as ContextFile);
    });
    return files;
};

export const deleteContextFile = async (projectId: string, id: string): Promise<void> => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${CONTEXT_COLLECTION}`, id));
};
