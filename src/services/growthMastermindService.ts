import {
    collection,
    getDocs,
    deleteDoc,
    doc,
    setDoc,
    query,
    orderBy,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface MarketingStrategy {
    id: string;
    projectId: string;
    userId: string;
    objective: string;
    content: string; // Markdown content from AI
    createdAt: number;
}

const STRATEGIES_COLLECTION = 'marketingStrategies';

export const saveMarketingStrategy = async (
    projectId: string,
    strategy: Omit<MarketingStrategy, 'id' | 'createdAt' | 'userId' | 'projectId'>
): Promise<string> => {
    if (!auth.currentUser) throw new Error('User must be authenticated');

    // Generate a new simple ID based on timestamp
    const id = `strategy_${Date.now()}`;
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${STRATEGIES_COLLECTION}`, id);

    await setDoc(docRef, {
        ...strategy,
        id,
        projectId,
        userId: auth.currentUser.uid,
        createdAt: Date.now(),
    });

    return docRef.id;
};

export const getMarketingStrategies = async (projectId: string): Promise<MarketingStrategy[]> => {
    if (!auth.currentUser) return [];

    const q = query(
        collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${STRATEGIES_COLLECTION}`),
        orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const strategies: MarketingStrategy[] = [];
    querySnapshot.forEach((doc) => {
        strategies.push(doc.data() as MarketingStrategy);
    });

    return strategies;
};

export const deleteMarketingStrategy = async (projectId: string, id: string): Promise<void> => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${STRATEGIES_COLLECTION}`, id));
};
