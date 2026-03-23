import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, getDocs, setDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { KeywordResearchData } from './ai';
import { v4 as uuidv4 } from 'uuid';

export interface SavedKeywordResearch {
    id: string;
    projectId: string;
    seedKeyword: string;
    intent: string;
    country: string;
    data: KeywordResearchData;
    createdAt: number;
}

const COLLECTION_NAME = 'keywordResearches';

export async function saveKeywordResearch(
    projectId: string,
    seedKeyword: string,
    intent: string,
    country: string,
    data: KeywordResearchData
): Promise<SavedKeywordResearch> {
    const allSaved = await getKeywordResearches(projectId);

    // Enforce Max 15 limit
    if (allSaved.length >= 15) {
        // Delete the oldest one(s) to make room
        const toDelete = allSaved.slice(14); // Keep 14, delete the rest
        for (const item of toDelete) {
            await deleteKeywordResearch(projectId, item.id);
        }
    }

    const id = uuidv4();
    const newResearch: SavedKeywordResearch = {
        id,
        projectId,
        seedKeyword,
        intent,
        country,
        data,
        createdAt: Date.now(),
    };

    if (!auth.currentUser) throw new Error('User must be authenticated');
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}/${id}`);
    await setDoc(docRef, newResearch);

    return newResearch;
}

export async function getKeywordResearches(projectId: string): Promise<SavedKeywordResearch[]> {
    if (!auth.currentUser) return [];
    const colRef = collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}`);
    const q = query(colRef, orderBy('createdAt', 'desc')); // Newest first

    const querySnapshot = await getDocs(q);
    const researches: SavedKeywordResearch[] = [];
    querySnapshot.forEach((docSnap) => {
        researches.push(docSnap.data() as SavedKeywordResearch);
    });

    return researches;
}

export async function deleteKeywordResearch(projectId: string, researchId: string): Promise<void> {
    if (!auth.currentUser) return;
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}/${researchId}`);
    await deleteDoc(docRef);
}
