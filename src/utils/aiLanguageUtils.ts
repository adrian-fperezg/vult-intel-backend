export type Language = 'en' | 'es';

/**
 * Retrieves the current system language from localStorage.
 * Defaults to 'en' (English) if not set.
 */
export function getSystemLanguage(): Language {
    return (localStorage.getItem('vult_language') as Language) || 'en';
}

/**
 * Generates a strict AI directive to ensure the response is in the target language.
 */
export function getLanguageDirective(explicitLang?: Language): string {
    const lang = explicitLang || getSystemLanguage();
    if (lang === 'en') {
        return "IMPORTANT: You MUST respond ENTIRELY in ENGLISH. This applies to all generated text, JSON string values, and markdown. Do NOT use any Spanish unless specifically requested for translation purposes.";
    } else {
        return "IMPORTANTE: DEBES responder TOTALMENTE en ESPAÑOL. Esto aplica a todo el texto generado, valores de cadenas JSON y markdown. NO uses inglés a menos que se solicite específicamente para fines de traducción.";
    }
}
