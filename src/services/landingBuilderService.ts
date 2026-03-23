import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface SavedLandingBlueprint {
    id: string;
    projectId: string;
    contentType: string;
    objective: string;
    trafficSource: string;
    targetAudience: string;
    data: any; // We'll type this locally in the component or use BlueprintData
    createdAt: number;
}

const COLLECTION_NAME = 'landingBlueprints';
const MAX_SAVED_ITEMS = 15;

export const saveLandingBlueprint = async (
    projectId: string,
    contentType: string,
    objective: string,
    trafficSource: string,
    targetAudience: string,
    data: any
): Promise<string> => {
    try {
        if (!auth.currentUser) throw new Error('User must be authenticated');
        const docRef = await addDoc(collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}`), {
            projectId,
            contentType,
            objective,
            trafficSource,
            targetAudience,
            data,
            createdAt: Date.now(),
            serverCreatedAt: serverTimestamp()
        });

        // Enforce limit
        await enforceLimit(projectId);

        return docRef.id;
    } catch (error) {
        console.error("Error saving landing blueprint to Firestore:", error);
        throw error;
    }
};

export const getLandingBlueprints = async (projectId: string): Promise<SavedLandingBlueprint[]> => {
    try {
        if (!auth.currentUser) return [];
        const q = query(
            collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}`),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);

        const blueprints: SavedLandingBlueprint[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            blueprints.push({
                id: doc.id,
                projectId: data.projectId,
                contentType: data.contentType,
                objective: data.objective,
                trafficSource: data.trafficSource,
                targetAudience: data.targetAudience,
                data: data.data,
                createdAt: data.createdAt
            });
        });

        return blueprints;
    } catch (error) {
        console.error("Error getting landing blueprints:", error);
        return [];
    }
};

export const deleteLandingBlueprint = async (projectId: string, blueprintId: string): Promise<void> => {
    try {
        if (!auth.currentUser) return;
        await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}/${blueprintId}`));
    } catch (error) {
        console.error("Error deleting landing blueprint:", error);
        throw error;
    }
};

async function enforceLimit(projectId: string) {
    try {
        // Fetch all blueprints for this project
        const blueprints = await getLandingBlueprints(projectId);

        if (blueprints.length > MAX_SAVED_ITEMS) {
            // Sort by createdAt ascending (oldest first)
            const sortedBlueprints = [...blueprints].sort((a, b) => a.createdAt - b.createdAt);

            // Calculate how many to delete
            const numToDelete = sortedBlueprints.length - MAX_SAVED_ITEMS;

            // Delete the oldest ones
            for (let i = 0; i < numToDelete; i++) {
                if (!auth.currentUser) break;
                await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}/${sortedBlueprints[i].id}`));
            }
        }
    } catch (error) {
        console.error("Error enforcing landing blueprint limit:", error);
    }
}
