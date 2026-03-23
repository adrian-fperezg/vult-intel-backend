import {
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    query,
    where,
    serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

const COLLECTION = 'contentDrafts';

// The shape we persist — matches the Campaign interface in ContentGenerator minus runtime UI state
export interface DraftRecord {
    id: string;
    userId: string;
    projectId: string;
    title: string;
    lastModified: number;
    isDeleted: boolean;
    // Content
    userInstruction: string;
    contentTypeId: string;
    platformId: string;
    objectiveId: string;
    selectedPillarId: string;
    selectedAudience: string;
    targetAudiences: string[];
    contentPillars: { id: string; label: string; desc: string }[];
    // Brand Persona
    voicePlayful: number;
    voiceCasual: number;
    voiceConservative: number;
    detailLevel: number;
    persuasionLevel: number;
    formattingRules: string;
    prohibitedTerms: string;
    currentPresetId: string | null;
    // Context
    contextFiles: { name: string; content: string }[];
    useExternalSources: boolean;
    // Format
    includeEmojis: boolean;
    includeHashtags: boolean;
    includeCTA: boolean;
    includeBulletPoints: boolean;
    includeQuestions: boolean;
    includeHook: boolean;
    targetWordCount: number | null;
    // Output
    generatedContent: string | null;
    aiInsight: string | null;
    variants: string[];
    activeTab: string;
}

/**
 * Upsert a campaign draft to Firestore.
 * Uses the campaign's local id as the Firestore document id so updates
 * are idempotent and don't create duplicate documents.
 */
export const saveDraft = async (
    uid: string,
    projectId: string,
    campaign: Omit<DraftRecord, 'userId' | 'projectId'>
): Promise<void> => {
    if (!auth.currentUser) throw new Error('User must be authenticated');
    const docRef = doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION}`, campaign.id);
    await setDoc(
        docRef,
        {
            ...campaign,
            userId: uid,
            projectId,
            serverUpdatedAt: serverTimestamp(),
        },
        { merge: true }
    );
};

/**
 * Fetch all drafts for a user+project, newest first.
 */
export const getDrafts = async (
    uid: string,
    projectId: string
): Promise<DraftRecord[]> => {
    try {
        if (!auth.currentUser) return [];
        const q = query(
            collection(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION}`)
        );
        const snap = await getDocs(q);
        const all = snap.docs.map((d) => {
            const data = d.data();
            return {
                id: d.id,
                userId: data.userId,
                projectId: data.projectId,
                title: data.title,
                lastModified: data.lastModified,
                isDeleted: data.isDeleted ?? false,
                userInstruction: data.userInstruction ?? '',
                contentTypeId: data.contentTypeId ?? '',
                platformId: data.platformId ?? '',
                objectiveId: data.objectiveId ?? '',
                selectedPillarId: data.selectedPillarId ?? '',
                selectedAudience: data.selectedAudience ?? '',
                targetAudiences: data.targetAudiences ?? [],
                contentPillars: data.contentPillars ?? [],
                voicePlayful: data.voicePlayful ?? 20,
                voiceCasual: data.voiceCasual ?? 30,
                voiceConservative: data.voiceConservative ?? 40,
                detailLevel: data.detailLevel ?? 40,
                persuasionLevel: data.persuasionLevel ?? 60,
                formattingRules: data.formattingRules ?? '',
                prohibitedTerms: data.prohibitedTerms ?? '',
                currentPresetId: data.currentPresetId ?? null,
                contextFiles: data.contextFiles ?? [],
                useExternalSources: data.useExternalSources ?? false,
                includeEmojis: data.includeEmojis ?? true,
                includeHashtags: data.includeHashtags ?? true,
                includeCTA: data.includeCTA ?? true,
                includeBulletPoints: data.includeBulletPoints ?? false,
                includeQuestions: data.includeQuestions ?? false,
                includeHook: data.includeHook ?? true,
                targetWordCount: data.targetWordCount ?? null,
                generatedContent: data.generatedContent ?? null,
                aiInsight: data.aiInsight ?? null,
                variants: data.variants ?? [],
                activeTab: data.activeTab ?? 'create',
            } as DraftRecord;
        });
        // Sort newest first, in memory
        return all
            .sort((a, b) => b.lastModified - a.lastModified);
    } catch (err) {
        console.error('Error fetching drafts:', err);
        return [];
    }
};

/**
 * Permanently delete a draft document from Firestore.
 */
export const deleteDraft = async (projectId: string, draftId: string): Promise<void> => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, `customers/${auth.currentUser.uid}/projects/${projectId}/${COLLECTION}`, draftId));
};
