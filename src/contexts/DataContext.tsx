import React, { createContext, useContext, ReactNode } from 'react';
import { db } from '../lib/firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    addDoc
} from 'firebase/firestore';
import { useAuth } from './AuthContext';

interface DataContextType {
    saveDocument: (collectionName: string, data: any, docId?: string) => Promise<string>;
    getDocument: (collectionName: string, docId: string) => Promise<any | null>;
    getUserDocuments: (collectionName: string) => Promise<any[]>;
    deleteDocument: (collectionName: string, docId: string) => Promise<void>;
    updateDocument: (collectionName: string, docId: string, data: any) => Promise<void>;
}

const DataContext = createContext<DataContextType>({} as DataContextType);

export const useData = () => useContext(DataContext);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();

    // Basic CRUD generic bindings for Firebase
    const saveDocument = async (collectionName: string, data: any, docId?: string) => {
        if (!currentUser) throw new Error("Must be logged in to save data");

        const collectionRef = collection(db, collectionName);
        const docData = {
            ...data,
            userId: currentUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        if (docId) {
            const docRef = doc(db, collectionName, docId);
            await setDoc(docRef, docData, { merge: true });
            return docId;
        } else {
            const newDocRef = await addDoc(collectionRef, docData);
            return newDocRef.id;
        }
    };

    const getDocument = async (collectionName: string, docId: string) => {
        if (!currentUser) throw new Error("Must be logged in");

        const docRef = doc(db, collectionName, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists() && docSnap.data().userId === currentUser.uid) {
            return { id: docSnap.id, ...docSnap.data() };
        }
        return null;
    };

    const getUserDocuments = async (collectionName: string) => {
        if (!currentUser) return [];

        const q = query(collection(db, collectionName), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    };

    const deleteDocument = async (collectionName: string, docId: string) => {
        if (!currentUser) throw new Error("Must be logged in");
        await deleteDoc(doc(db, collectionName, docId));
    };

    const updateDocument = async (collectionName: string, docId: string, data: any) => {
        if (!currentUser) throw new Error("Must be logged in");
        const docRef = doc(db, collectionName, docId);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    };

    const value = {
        saveDocument,
        getDocument,
        getUserDocuments,
        deleteDocument,
        updateDocument
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};
