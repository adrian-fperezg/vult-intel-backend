import React, { createContext, useContext, useState, useEffect } from 'react';
import enTranslations from '../locales/en.json';
import esTranslations from '../locales/es.json';

type Language = 'en' | 'es';
type Translations = Record<string, any>;

interface TranslationContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, replacements?: Record<string, string>) => string;
}

const translations: Record<Language, Translations> = {
    en: enTranslations,
    es: esTranslations,
};

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>('es');

    // Try to load language from localStorage
    useEffect(() => {
        const savedLang = localStorage.getItem('vult_language') as Language;
        if (savedLang && (savedLang === 'en' || savedLang === 'es')) {
            setLanguage(savedLang);
        } else {
            // Auto-detect browser language
            const browserLang = navigator.language.split('-')[0];
            if (browserLang === 'en' || browserLang === 'es') {
                setLanguage(browserLang as Language);
            }
        }
    }, []);

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('vult_language', lang);
    };

    const t = (key: string, replacements?: Record<string, string>): string => {
        const keys = key.split('.');
        let value: any = translations[language];

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // Fallback to English
                if (language !== 'en') {
                    let fallbackValue: any = translations['en'];
                    let foundFallback = true;
                    for (const fallbackKey of keys) {
                        if (fallbackValue && typeof fallbackValue === 'object' && fallbackKey in fallbackValue) {
                            fallbackValue = fallbackValue[fallbackKey];
                        } else {
                            foundFallback = false;
                            break;
                        }
                    }
                    if (foundFallback && typeof fallbackValue === 'string') {
                        value = fallbackValue;
                        break;
                    }
                }
                return key; // Key path not found
            }
        }

        if (typeof value === 'string') {
            if (replacements) {
                return Object.entries(replacements).reduce(
                    (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), v),
                    value
                );
            }
            return value;
        }

        return key; // The path didn't resolve to a string
    };

    return (
        <TranslationContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
            {children}
        </TranslationContext.Provider>
    );
};

export const useTranslation = () => {
    const context = useContext(TranslationContext);
    if (context === undefined) {
        throw new Error('useTranslation must be used within a TranslationProvider');
    }
    return context;
};
