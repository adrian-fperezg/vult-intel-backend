import React, { createContext, useContext } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import enTranslations from '../locales/en.json';
import esTranslations from '../locales/es.json';

type Language = 'en' | 'es';
type Translations = Record<string, any>;

interface TranslationContextType {
    language: Language;
    t: (key: string, options?: Record<string, any>) => any;
}

const translations: Record<Language, Translations> = {
    en: enTranslations,
    es: esTranslations,
};

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { language } = useSettings();

    const t = useCallback((key: string, options?: Record<string, any>): any => {
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
                    if (foundFallback) {
                        value = fallbackValue;
                        break;
                    }
                }
                return key; // Key path not found
            }
        }

        if (typeof value === 'string' && options) {
            return Object.entries(options).reduce(
                (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), String(v)),
                value
            );
        }

        return value;
    }, [language]);

    const value = React.useMemo(() => ({ language, t }), [language, t]);

    return (
        <TranslationContext.Provider value={value}>
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
