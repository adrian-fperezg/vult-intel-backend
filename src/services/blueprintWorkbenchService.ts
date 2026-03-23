import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp,
    limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface SavedWorkbenchItem {
    id: string; // The Firestore generated ID
    projectId: string; // To link to the current active project
    itemId: string; // The specific ID from the external context (e.g. keyword string)
    type: string; // 'keyword', 'competitor', 'copy', etc.
    title: string;
    data?: any;
    createdAt?: number;
}

const COLLECTION_NAME = 'blueprintWorkbenchItems';
const MAX_SAVED_ITEMS = 50; // generous limit for the workbench

export const saveBlueprintWorkbenchItem = async (
    projectId: string,
    itemId: string,
    type: string,
    title: string,
    data?: any
): Promise<SavedWorkbenchItem> => {
    try {
        // Enforce quota
        const allSaved = await getBlueprintWorkbenchItems(projectId);
        if (allSaved.length >= MAX_SAVED_ITEMS) {
            // delete oldest
            const toDelete = allSaved.slice(MAX_SAVED_ITEMS - 1);
            for (const item of toDelete) {
                await deleteBlueprintWorkbenchItem(item.id);
            }
        }

        const newItemPayload = {
            projectId,
            itemId,
            type,
            title,
            data: data || null,
            createdAt: Date.now(),
            serverCreatedAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, COLLECTION_NAME), newItemPayload);

        return {
            id: docRef.id,
            ...newItemPayload
        };
    } catch (error) {
        console.error('Error saving blueprint workbench item:', error);
        throw error;
    }
};

export const getBlueprintWorkbenchItems = async (projectId: string): Promise<SavedWorkbenchItem[]> => {
    try {
        // get all items globally sorted by date, then filter natively (could also add an index if scaled)
        const q = query(
            collection(db, COLLECTION_NAME),
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const items: SavedWorkbenchItem[] = [];

        snap.forEach((d) => {
            const data = d.data();
            if (data.projectId === projectId) {
                items.push({
                    id: d.id,
                    projectId: data.projectId,
                    itemId: data.itemId,
                    type: data.type,
                    title: data.title,
                    data: data.data,
                    createdAt: data.createdAt,
                });
            }
        });

        return items;
    } catch (error) {
        console.error('Error fetching blueprint workbench items:', error);
        return [];
    }
};

export const deleteBlueprintWorkbenchItem = async (docId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, docId));
    } catch (error) {
        console.error('Error deleting blueprint workbench item:', error);
        throw error;
    }
};
