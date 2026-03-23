import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, getDocs, setDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { SeoAuditData } from './ai';
import { v4 as uuidv4 } from 'uuid';

export interface SavedSeoAudit {
    id: string;
    projectId: string;
    canonicalUrl: string;
    competitors: string[];
    focusPages: string;
    goal: string;
    data: SeoAuditData;
    createdAt: number;
}

const COLLECTION_NAME = 'seoAudits';

export async function saveSeoAudit(
    projectId: string,
    canonicalUrl: string,
    competitors: string[],
    focusPages: string,
    goal: string,
    data: SeoAuditData
): Promise<SavedSeoAudit> {
    const allSaved = await getSeoAudits(projectId);

    // Enforce Max 15 limit
    if (allSaved.length >= 15) {
        // Delete the oldest one(s) to make room
        const toDelete = allSaved.slice(14); // Keep 14, delete the rest
        for (const item of toDelete) {
            await deleteSeoAudit(projectId, item.id);
        }
    }

    const id = uuidv4();
    const newAudit: SavedSeoAudit = {
        id,
        projectId,
        canonicalUrl,
        competitors,
        focusPages,
        goal,
        data,
        createdAt: Date.now(),
    };

    if (!auth.currentUser) throw new Error('User must be authenticated');
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}/${id}`);
    await setDoc(docRef, newAudit);

    return newAudit;
}

export async function getSeoAudits(projectId: string): Promise<SavedSeoAudit[]> {
    if (!auth.currentUser) return [];
    const colRef = collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}`);
    const q = query(colRef, orderBy('createdAt', 'desc')); // Newest first

    const querySnapshot = await getDocs(q);
    const audits: SavedSeoAudit[] = [];
    querySnapshot.forEach((docSnap) => {
        audits.push(docSnap.data() as SavedSeoAudit);
    });

    return audits;
}

export async function deleteSeoAudit(projectId: string, auditId: string): Promise<void> {
    if (!auth.currentUser) return;
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}/${auditId}`);
    await deleteDoc(docRef);
}
