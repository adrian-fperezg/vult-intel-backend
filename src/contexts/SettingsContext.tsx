import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';


type Theme = 'dark' | 'light';
type Language = 'en' | 'es';

interface NotificationPrefs {
    quota80: boolean;
    quota90: boolean;
    quota100: boolean;
    deepScanFinished: boolean;
    urlReadFailure: boolean;
    docsExportReady: boolean;
    [key: string]: boolean;
}

interface SettingsContextType {
    theme: Theme;
    language: Language;
    marketingEmails: boolean;
    appNotifications: boolean;
    notificationPrefs: NotificationPrefs;
    setTheme: (theme: Theme) => void;
    setLanguage: (lang: Language) => void;
    setMarketingEmails: (val: boolean) => void;
    setAppNotifications: (val: boolean) => void;
    updateNotificationPref: (key: keyof NotificationPrefs, value: boolean) => void;
    saveSettings: () => Promise<void>;
    isSyncing: boolean;
}

const defaultNotificationPrefs: NotificationPrefs = {
    quota80: true,
    quota90: true,
    quota100: true,
    deepScanFinished: true,
    urlReadFailure: true,
    docsExportReady: true,
};




const SettingsContext = createContext<SettingsContextType | undefined>(undefined);



const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const { currentUser } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [theme, setTheme] = useState<Theme>(() => {
        try {
            const val = localStorage.getItem('theme');
            return (val === 'dark' || val === 'light') ? val : 'dark';
        } catch { return 'dark'; }
    });
    const [language, setLanguage] = useState<Language>(() => {
        try {
            const val = localStorage.getItem('vult_language');
            return (val === 'es') ? 'es' : 'en';
        } catch { return 'en'; }
    });
    const [marketingEmails, setMarketingEmails] = useState(() => {
        try { return localStorage.getItem('marketingEmails') !== 'false'; } catch { return true; }
    });
    const [appNotifications, setAppNotifications] = useState(() => {
        try { return localStorage.getItem('appNotifications') !== 'false'; } catch { return true; }
    });
    const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(() => {
        try {
            const saved = localStorage.getItem('notificationPrefs');
            return saved && saved !== 'undefined' && saved !== 'null' ? JSON.parse(saved) : defaultNotificationPrefs;
        } catch {
            return defaultNotificationPrefs;
        }
    });

    useEffect(() => {
        localStorage.setItem('theme', theme);
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
            root.classList.remove('light');
        } else {
            root.classList.add('light');
            root.classList.remove('dark');
        }
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('vult_language', language);
    }, [language]);

    useEffect(() => {
        localStorage.setItem('marketingEmails', String(marketingEmails));
    }, [marketingEmails]);

    useEffect(() => {
        localStorage.setItem('appNotifications', String(appNotifications));
    }, [appNotifications]);

    useEffect(() => {
        localStorage.setItem('notificationPrefs', JSON.stringify(notificationPrefs));
    }, [notificationPrefs]);

    // Firestore Sync Logic
    useEffect(() => {
        if (!currentUser) return;

        const settingsDoc = doc(db, `customers/${currentUser.uid}/settings`, 'preferences');

        // Initial load from Firestore
        const unsubscribe = onSnapshot(settingsDoc, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.theme === 'dark' || data.theme === 'light') setTheme(data.theme);
                if (data.language === 'en' || data.language === 'es') setLanguage(data.language);
                if (typeof data.marketingEmails === 'boolean') setMarketingEmails(data.marketingEmails);
                if (typeof data.appNotifications === 'boolean') setAppNotifications(data.appNotifications);
                if (data.notificationPrefs) setNotificationPrefs(data.notificationPrefs);
            }
        });

        return () => unsubscribe();
    }, [currentUser]);

    const saveSettings = async () => {
        if (!currentUser) return;
        setIsSyncing(true);
        try {
            const settingsDoc = doc(db, `customers/${currentUser.uid}/settings`, 'preferences');
            await setDoc(settingsDoc, {
                theme,
                language,
                marketingEmails,
                appNotifications,
                notificationPrefs,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (error) {
            console.error("Error saving settings to Firestore:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <SettingsContext.Provider
            value={{
                theme, language, marketingEmails, appNotifications, notificationPrefs,
                setTheme, setLanguage, setMarketingEmails, setAppNotifications,
                updateNotificationPref, saveSettings, isSyncing
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
