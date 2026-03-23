// src/utils/subscriptionManager.ts

/**
 * Define los planes base disponibles en la plataforma.
 */
export type PlanId = 'solo' | 'growth' | 'agency';

/**
 * Define los complementos (add-ons) disponibles que modifican los límites.
 */
export type AddonId = 'veo_studio_pack' | 'outreach';

/**
 * Perfil de suscripción del usuario, reflejando el estado en la base de datos.
 */
export interface UserSubscriptionProfile {
    currentPlanId: PlanId;
    activeAddons: AddonId[];
}

/**
 * Estructura de los límites que controlan el uso dentro de la plataforma.
 */
export interface SubscriptionLimits {
    tokens: number;
    projects: number;
    personas: number;
    pillars: number;
    deepScans: number;
    images: number;
    videos: number;
}

/**
 * LÍMITES BASE POR PLAN
 * Configuración estricta por defecto para cada tier de suscripción.
 */
export const BASE_PLAN_LIMITS: Record<PlanId, SubscriptionLimits> = {
    solo: {
        tokens: 1500000,
        projects: 2,
        personas: 3,
        pillars: 3,
        deepScans: 20,
        images: 10,
        videos: 0,
    },
    growth: {
        tokens: 3000000,
        projects: 5,
        personas: 10,
        pillars: 7,
        deepScans: 50,
        images: 50,
        videos: 0,
    },
    agency: {
        tokens: 5000000,
        projects: 20,
        personas: 10,
        pillars: 7,
        deepScans: 150,
        images: 200,
        videos: 0,
    }
};

/**
 * LÍMITES ILIMITADOS (Para el Fundador)
 * Proporciona valores masivos para evitar bloqueos por cuotas.
 */
export const UNLIMITED_LIMITS: SubscriptionLimits = {
    tokens: 999999999,
    projects: 9999,
    personas: 999,
    pillars: 999,
    deepScans: 9999,
    images: 9999,
    videos: 999,
};

/**
 * MODIFICADORES DE LÍMITES POR ADD-ON
 * Define qué añade exactamente cada complemento a los límites base.
 * Mantenemos todas las propiedades del tipo SubscriptionLimits pero como opcionales (`Partial`),
 * permitiendo sumar solo lo necesario.
 */
export const ADDON_MODIFIERS: Record<AddonId, Partial<SubscriptionLimits>> = {
    veo_studio_pack: {
        videos: 32
    },
    outreach: {}
};

/**
 * El Calculador: Función Maestra para determinar los límites totales disponibles del usuario.
 * 
 * A. Extrae los límites base del currentPlanId.
 * B. Itera sobre el array de activeAddons del usuario.
 * C. Si el usuario tiene addons, suma esos valores a los límites base.
 * D. Retorna el objeto final consolidado con los límites exactos.
 * 
 * Útil tanto para bloquear UI en el Frontend o validar llamadas en el Backend/API.
 * 
 * @param profile Perfil de suscripción con su plan actual y complementos activos.
 * @returns Objeto SubscriptionLimits consolidado.
 */
export function calculateTotalLimits(profile: UserSubscriptionProfile): SubscriptionLimits {
    // 1. Extraer los límites base copiándolos para no mutar el objeto original (Pure Function)
    const baseLimits = BASE_PLAN_LIMITS[profile.currentPlanId];
    if (!baseLimits) {
        throw new Error(`Invalid plan ID provided: ${profile.currentPlanId}`);
    }

    const totalLimits: SubscriptionLimits = { ...baseLimits };

    // 2. Iterar sobre todos los add-ons activos del usuario
    for (const addonId of profile.activeAddons) {
        const modifier = ADDON_MODIFIERS[addonId];

        // 3. Si el add-on es reconocido, sumamos sus valores a los límites consolidados
        if (modifier) {
            // Recorremos las claves explícitamente para mantener seguridad de tipos
            const keys = Object.keys(modifier) as Array<keyof SubscriptionLimits>;
            for (const key of keys) {
                if (modifier[key] !== undefined) {
                    // Sumamos el modificador al límite total
                    totalLimits[key] += modifier[key] as number;
                }
            }
        }
    }

    // 4. Retornar el cálculo final
    return totalLimits;
}
