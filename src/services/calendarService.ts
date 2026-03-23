import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    updateDoc,
    query,
    orderBy,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type CalendarEventType =
    | 'social_post'
    | 'blog_post'
    | 'email'
    | 'video'
    | 'ad_campaign'
    | 'meeting'
    | 'deadline'
    | 'other';

export interface CalendarEvent {
    id: string;
    projectId: string;
    title: string;
    description?: string;
    date: string; // YYYY-MM-DD
    startTime?: string; // HH:MM
    endTime?: string; // HH:MM
    eventType: CalendarEventType;
    colorKey: string; // CSS color token key
    createdAt: number;
}

export const EVENT_TYPE_CONFIG: Record<
    CalendarEventType,
    { label: string; color: string; bgClass: string; borderClass: string; textClass: string }
> = {
    social_post: {
        label: 'Social Post',
        color: '#3B82F6',
        bgClass: 'bg-blue-500/15',
        borderClass: 'border-blue-500/30',
        textClass: 'text-blue-300',
    },
    blog_post: {
        label: 'Blog Post',
        color: '#8B5CF6',
        bgClass: 'bg-purple-500/15',
        borderClass: 'border-purple-500/30',
        textClass: 'text-purple-300',
    },
    email: {
        label: 'Email Campaign',
        color: '#10B981',
        bgClass: 'bg-emerald-500/15',
        borderClass: 'border-emerald-500/30',
        textClass: 'text-emerald-300',
    },
    video: {
        label: 'Video',
        color: '#F59E0B',
        bgClass: 'bg-amber-500/15',
        borderClass: 'border-amber-500/30',
        textClass: 'text-amber-300',
    },
    ad_campaign: {
        label: 'Ad Campaign',
        color: '#EF4444',
        bgClass: 'bg-red-500/15',
        borderClass: 'border-red-500/30',
        textClass: 'text-red-300',
    },
    meeting: {
        label: 'Meeting',
        color: '#6B7280',
        bgClass: 'bg-slate-500/15',
        borderClass: 'border-slate-500/30',
        textClass: 'text-slate-300',
    },
    deadline: {
        label: 'Deadline',
        color: '#F97316',
        bgClass: 'bg-orange-500/15',
        borderClass: 'border-orange-500/30',
        textClass: 'text-orange-300',
    },
    other: {
        label: 'Other',
        color: '#14B8A6',
        bgClass: 'bg-teal-500/15',
        borderClass: 'border-teal-500/30',
        textClass: 'text-teal-300',
    },
};

const COLLECTION_NAME = 'calendarEvents';

export const saveCalendarEvent = async (
    projectId: string,
    event: Omit<CalendarEvent, 'id' | 'createdAt'>
): Promise<string> => {
    try {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...event,
            projectId,
            createdAt: Date.now(),
            serverCreatedAt: serverTimestamp(),
        });
        return docRef.id;
    } catch (error) {
        console.error('Error saving calendar event:', error);
        throw error;
    }
};

export const getCalendarEvents = async (projectId: string): Promise<CalendarEvent[]> => {
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'asc'));
        const snap = await getDocs(q);
        const events: CalendarEvent[] = [];
        snap.forEach((d) => {
            const data = d.data();
            if (data.projectId === projectId) {
                events.push({
                    id: d.id,
                    projectId: data.projectId,
                    title: data.title,
                    description: data.description || '',
                    date: data.date,
                    startTime: data.startTime,
                    endTime: data.endTime,
                    eventType: data.eventType,
                    colorKey: data.colorKey,
                    createdAt: data.createdAt,
                });
            }
        });
        return events;
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        return [];
    }
};

export const updateCalendarEvent = async (
    eventId: string,
    updates: Partial<Omit<CalendarEvent, 'id' | 'createdAt' | 'projectId'>>
): Promise<void> => {
    try {
        await updateDoc(doc(db, COLLECTION_NAME, eventId), updates);
    } catch (error) {
        console.error('Error updating calendar event:', error);
        throw error;
    }
};

export const deleteCalendarEvent = async (eventId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, eventId));
    } catch (error) {
        console.error('Error deleting calendar event:', error);
        throw error;
    }
};
