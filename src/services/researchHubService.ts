import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface ResearchSource {
    type: 'file' | 'url';
    label: string;
    content: string; // raw text content extracted from the file or fetched from URL
}

export interface WorkbenchIdea {
    id: string;
    projectId: string;
    title: string;
    suggestedFormat: string;
    angle: string;
    readyPrompt: string; // Prompt for Create tab — no persona/tone/voice included
    createdAt: number;
}

const COLLECTION_NAME = 'researchWorkbench';
const MAX_SAVED_IDEAS = 20;

export const saveWorkbenchIdea = async (
    projectId: string,
    idea: Omit<WorkbenchIdea, 'id' | 'createdAt'>
): Promise<string> => {
    try {
        if (!auth.currentUser) throw new Error('User must be authenticated');
        const docRef = await addDoc(collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}`), {
            ...idea,
            projectId,
            createdAt: Date.now(),
            serverCreatedAt: serverTimestamp(),
        });
        await enforceLimit(projectId);
        return docRef.id;
    } catch (error) {
        console.error('Error saving workbench idea:', error);
        throw error;
    }
};

export const getWorkbenchIdeas = async (projectId: string): Promise<WorkbenchIdea[]> => {
    try {
        if (!auth.currentUser) return [];
        const q = query(
            collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}`),
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);

        const ideas: WorkbenchIdea[] = [];
        snap.forEach((d) => {
            const data = d.data();
            ideas.push({
                id: d.id,
                projectId: data.projectId,
                title: data.title,
                suggestedFormat: data.suggestedFormat,
                angle: data.angle,
                readyPrompt: data.readyPrompt,
                createdAt: data.createdAt,
            });
        });
        return ideas;
    } catch (error) {
        console.error('Error fetching workbench ideas:', error);
        return [];
    }
};

export const deleteWorkbenchIdea = async (projectId: string, ideaId: string): Promise<void> => {
    try {
        if (!auth.currentUser) return;
        await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}`, ideaId));
    } catch (error) {
        console.error('Error deleting workbench idea:', error);
        throw error;
    }
};

async function enforceLimit(projectId: string) {
    try {
        const ideas = await getWorkbenchIdeas(projectId);
        if (ideas.length > MAX_SAVED_IDEAS) {
            const sorted = [...ideas].sort((a, b) => a.createdAt - b.createdAt);
            const numToDelete = sorted.length - MAX_SAVED_IDEAS;
            for (let i = 0; i < numToDelete; i++) {
                if (!auth.currentUser) break;
                await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION_NAME}`, sorted[i].id));
            }
        }
    } catch (error) {
        console.error('Error enforcing workbench limit:', error);
    }
}
