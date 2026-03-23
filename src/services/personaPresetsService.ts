import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp,
    limit,
    getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface BrandPersonaPreset {
    id: string; // The Firestore generated ID
    projectId: string; // To link to the current active project
    name: string;
    playful: number;
    casual: number;
    conservative: number;
    detailLevel: number;
    persuasionLevel: number;
    formattingRules: string;
    prohibitedTerms: string;
    createdAt?: number;
}

const COLLECTION_NAME = 'personaPresets';

export const savePersonaPreset = async (
    projectId: string,
    presetData: Omit<BrandPersonaPreset, 'id' | 'projectId' | 'createdAt'>
): Promise<BrandPersonaPreset> => {
    try {
        const newItemPayload = {
            projectId,
            ...presetData,
            createdAt: Date.now(),
            serverCreatedAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, COLLECTION_NAME), newItemPayload);

        return {
            id: docRef.id,
            projectId,
            ...presetData,
            createdAt: newItemPayload.createdAt
        };
    } catch (error) {
        console.error('Error saving persona preset:', error);
        throw error;
    }
};

export const getPersonaPresets = async (projectId: string): Promise<BrandPersonaPreset[]> => {
    try {
        const q = query(
            collection(db, COLLECTION_NAME),
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const items: BrandPersonaPreset[] = [];

        snap.forEach((d) => {
            const data = d.data();
            if (data.projectId === projectId) {
                items.push({
                    id: d.id,
                    projectId: data.projectId,
                    name: data.name,
                    playful: data.playful,
                    casual: data.casual,
                    conservative: data.conservative,
                    detailLevel: data.detailLevel,
                    persuasionLevel: data.persuasionLevel,
                    formattingRules: data.formattingRules,
                    prohibitedTerms: data.prohibitedTerms,
                    createdAt: data.createdAt,
                });
            }
        });

        return items;
    } catch (error) {
        console.error('Error fetching persona presets:', error);
        return [];
    }
};

export const deletePersonaPreset = async (docId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, docId));
    } catch (error) {
        console.error('Error deleting persona preset:', error);
        throw error;
    }
};
