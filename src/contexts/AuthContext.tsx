import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    User,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider
} from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { logAuthEvent } from '../services/analytics';
import { isFounder as checkIsFounder } from '../utils/founderUtils';

interface AuthContextType {
    currentUser: User | null;
    isAdmin: boolean;
    isTester: boolean;
    isFounder: boolean;
    totalTokensUsed: number;
    loading: boolean;
    loginWithGoogle: () => Promise<void>;
    login: (email: string, pass: string) => Promise<void>;
    register: (email: string, pass: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isTester, setIsTester] = useState(false);
    const [totalTokensUsed, setTotalTokensUsed] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribeUserDoc: () => void;

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            console.log("[AuthContext] onAuthStateChanged:", user?.email || "No user");
            setCurrentUser(user);
            if (user) {
                const userRef = doc(db, 'customers', user.uid);
                console.log("[AuthContext] Fetching user document from customers/%s...", user.uid);
                unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
                    console.log("[AuthContext] User document received, exists:", docSnap.exists());
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setIsAdmin(data.role === 'admin');
                        setIsTester(data.isTester === true);
                        setTotalTokensUsed(data.totalTokensUsed ?? 0);

                        // Monthly Reset Logic
                        const now = new Date();
                        const currentMonthYear = `${now.getMonth()}-${now.getFullYear()}`;
                        const lastReset = data.lastTokenResetDate; // Expected format: "M-YYYY"

                        if (lastReset !== currentMonthYear) {
                            console.log("[AuthContext] Monthly reset triggered for user:", user.uid);
                            setDoc(userRef, {
                                totalTokensUsed: 0,
                                lastTokenResetDate: currentMonthYear,
                                deepScansGenerated: 0, // Resetting other usage metrics as well for the month
                                imagesGenerated: 0,
                                videosGenerated: 0
                            }, { merge: true }).catch(err => console.error("Monthly reset failed:", err));
                        }
                        console.log("[AuthContext] isAdmin:", data.role === 'admin', "isTester:", data.isTester === true);
                    } else {
                        setIsAdmin(false);
                        setIsTester(false);
                        setTotalTokensUsed(0);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("[AuthContext] Error fetching user document:", error);
                    setIsAdmin(false);
                    setLoading(false);
                });
            } else {
                console.log("[AuthContext] No user, skipping doc fetch.");
                setIsAdmin(false);
                setIsTester(false);
                setLoading(false);
                if (unsubscribeUserDoc) {
                    unsubscribeUserDoc();
                }
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeUserDoc) {
                unsubscribeUserDoc();
            }
        };
    }, []);

    const loginWithGoogle = async () => {
        try {
            googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
            const result = await signInWithPopup(auth, googleProvider);
            logAuthEvent('google', 'login');

            const user = result.user;
            if (user) {
                const userRef = doc(db, 'customers', user.uid);
                const userSnap = await getDoc(userRef);

                if (!userSnap.exists()) {
                    const defaultTheme = localStorage.getItem('theme') || 'dark';
                    const defaultLang = localStorage.getItem('language') || 'es';

                    await setDoc(userRef, {
                        email: user.email,
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        theme: defaultTheme,
                        language: defaultLang,
                        createdAt: serverTimestamp()
                    });
                }
            }
        } catch (error) {
            console.error("Error signing in with Google:", error);
            throw error;
        }
    };

    const login = async (email: string, pass: string) => {
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            logAuthEvent('email', 'login');
        } catch (error) {
            console.error("Error logging in:", error);
            throw error;
        }
    };

    const register = async (email: string, pass: string) => {
        try {
            const result = await createUserWithEmailAndPassword(auth, email, pass);
            logAuthEvent('email', 'signup');

            const user = result.user;
            if (user) {
                const userRef = doc(db, 'customers', user.uid);
                const defaultTheme = localStorage.getItem('theme') || 'dark';
                const defaultLang = localStorage.getItem('language') || 'es';

                // For registration we just set it directly
                await setDoc(userRef, {
                    email: user.email,
                    displayName: user.displayName || email.split('@')[0], // Fallback name
                    photoURL: user.photoURL,
                    theme: defaultTheme,
                    language: defaultLang,
                    createdAt: serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Error registering:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error logging out:", error);
            throw error;
        }
    };

    const value = {
        currentUser,
        isAdmin,
        isTester,
        isFounder: checkIsFounder(currentUser?.email),
        totalTokensUsed,
        loading,
        loginWithGoogle,
        login,
        register,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
