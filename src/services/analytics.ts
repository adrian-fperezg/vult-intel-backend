import { analytics } from '@/lib/firebase';
import { logEvent as firebaseLogEvent } from 'firebase/analytics';

/**
 * Wrapper centralizado para disparar eventos de Google Analytics.
 * @param eventName Nombre del evento (Usa formato snake_case o camelCase según GA4).
 * @param eventParams Parámetros adicionales a incluir en el evento.
 */
export const logCustomEvent = (eventName: string, eventParams?: Record<string, any>) => {
    if (analytics) {
        try {
            firebaseLogEvent(analytics, eventName, eventParams);
        } catch (error) {
            console.error(`Error logging event ${eventName}:`, error);
        }
    }
};

/**
 * Registra una vista de página manualmente.
 * @param page_path La ruta de la página visitada (ej. '/deep-scan').
 */
export const logPageView = (page_path: string) => {
    logCustomEvent('page_view', { page_path });
};

// --- WRAPPERS ESPECÍFICOS PARA VULT INTEL ---

export const logAuthEvent = (method: 'google' | 'email', action: 'login' | 'signup') => {
    logCustomEvent(action, { method });
};

export const logDeepScanRun = (domain: string, country: string) => {
    logCustomEvent('run_deep_scan', { domain, country });
};

export const logGrowthPlanRun = (brandName: string, niche: string) => {
    logCustomEvent('generate_growth_plan', { brand_name: brandName, niche });
};

export const logContentGenerated = (contentType: string, model: string) => {
    logCustomEvent('generate_ai_content', { content_type: contentType, ai_model: model });
};

export const logFunnelCreated = (nodesCount: number) => {
    logCustomEvent('create_funnel_workflow', { nodes_count: nodesCount });
};

export const logPricingCTAClicked = (planName: 'Solo' | 'Growth' | 'Agency') => {
    logCustomEvent('pricing_cta_click', { plan_selected: planName });
};

export const trackImageGeneration = (userId: string) => {
    logCustomEvent('image_generated', {
        user_id: userId,
        timestamp: Date.now()
    });
};

export const trackDeepScanGeneration = (userId: string) => {
    logCustomEvent('deep_scan_generated', {
        user_id: userId,
        timestamp: Date.now()
    });
};
