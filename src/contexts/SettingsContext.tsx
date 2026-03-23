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
    t: (key: string) => any;
}

const defaultNotificationPrefs: NotificationPrefs = {
    quota80: true,
    quota90: true,
    quota100: true,
    deepScanFinished: true,
    urlReadFailure: true,
    docsExportReady: true,
};

import { landingTranslations } from '@/lib/translations';

const translations = {
    en: {
        ...landingTranslations.en,
        settings: 'Settings',
        profile: 'Profile',
        preferences: 'Preferences',
        billing: 'Billing',
        manageBilling: 'Manage Subscription',
        saveChanges: 'Save Changes',
        theme: 'Theme',
        language: 'Language',
        marketingEmails: 'Marketing Emails',
        appNotifications: 'App Notifications',
        darkMode: 'Dark Mode',
        lightMode: 'Light Mode',
        english: 'English',
        spanish: 'Spanish',
        billingDesc: 'Manage your billing cycle and payment methods securely via Stripe.',
        profileDesc: 'Manage your personal information.',
        preferencesDesc: 'Customize your experience.',
        photo: 'Profile Picture',
        fullName: 'Full Name',
        email: 'Email Address',

        // Global / General UI
        marketingPlatform: 'Marketing Platform',
        aiTokensUsedThisMonth: 'AI Tokens Used This Month',
        signOut: 'Sign Out',
        signInToVultIntel: 'Sign In to Vult Intel',
        cancel: 'Cancel',
        save: 'Save',
        delete: 'Delete',
        edit: 'Edit',
        copy: 'Copy',
        download: 'Download',
        export: 'Export',
        generate: 'Generate',
        generating: 'Generating...',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
        optional: 'Optional',
        noProjectSelected: 'No Active Project',
        noProjectDesc: 'Please select or create a project from the Projects Hub.',
        viewReport: 'View Report',
        newItem: 'New',
        completed: 'Completed',
        overallProgress: 'Overall Progress',

        // Sidebar Navigation
        navProjectsHub: 'Projects Hub',
        navFullScanReport: 'Full Scan Report',
        navContentGenerator: 'Content Generator',
        navWebGrowthPlan: 'Web Growth Plan',
        navGlobalBrandStrategy: 'Global Brand Strategy',
        navPersonaStudio: 'Persona Studio',
        navCampaignArchitect: 'Campaign Architect',
        navVisualWorkflows: 'Visual Workflows',

        // Command Center
        commandCenter: 'Command Center',
        commandCenterDesc: 'Manage platform telemetry, global reach, and system signals.',
        initializingCommandCenter: 'Initializing Command Center...',

        // Telemetry Hub
        telemetryHub: 'Telemetry and Usage Hub',
        aiPower: 'AI Power',
        tokensGenerated: 'Tokens Generated',
        deepScans: 'Deep Scans',
        imagesGenerated: 'Images Generated',
        activeCache: 'Active Cache',
        purgeCache: 'Purge Cache',
        storageManager: 'Storage Manager',
        activeProjects: 'Active Projects',
        campaignAssets: 'Campaign Assets',
        clearOldAssets: 'Clear Old Assets',

        // Notification Center
        notificationCenter: 'Smart Notification Center',
        usageQuotas: 'Usage and Quotas',
        alertAt: 'Alert at',
        utilization: 'Utilization',
        systemOperations: 'AI and System Operations',
        deepScanFinished: 'Deep Scan Finished',
        urlReadFailure: 'URL Read Failure',
        docsExportReady: 'Google Docs Export Ready',

        // Subscription Studio
        subscriptionStudio: 'Subscription and Add-on Studio',
        activeTier: 'Active Tier',
        growthPlan: 'Growth Plan',
        projectsIncluded: 'Active Projects Included',
        advancedPersonas: 'Advanced Persona Brains',
        upgradeToAgency: 'Upgrade to Agency',
        veoStudio: 'Veo Studio Pack',
        veoPrice: '+49 USD / MO',
        veoDesc: 'Unlock high fidelity video generation for all campaign assets.',
        status: 'Status',
        lockedFeature: 'Locked Feature',
        buyAddon: 'Buy Add-on',
        processing: 'Processing...',
        redirecting: 'Redirecting to Stripe...',

        // Global Preferences
        globalPreferences: 'Global Preferences and Appearance',
        themeEngine: 'Theme Engine',
        dark: 'Dark',
        light: 'Light',
        systemLanguage: 'System Language',
        englishGlobal: 'English',
        spanishIberian: 'Español',

        // AI Chat Bot
        chatAssistant: 'AI Assistant',
        chatContext: 'Context: ',
        chatNoContext: 'No project context',
        chatClearHistory: 'Clear chat history',
        chatClearConfirm: 'Are you sure you want to clear this chat history?',
        chatWelcomeTitle: 'How can I help you today?',
        chatWelcomeDesc: 'I have access to your brand strategy, personas, and pillars. Use my knowledge to optimize your content.',
        chatPlaceholder: 'Write a message...',
        chatFooterNote: 'Only the last messages are sent to optimize costs.',
        chatError: 'Sorry, there was an error processing your request. Please try again.',

        // Projects Hub (Pulse)
        projectsHub: 'Projects Hub',
        projectsHubSubtitle: 'Manage scans & marketing intelligence',
        startMarketingScan: 'Start a Marketing Scan',
        scanSubtitle: "Enter a competitor's URL to extract deep intelligence.",
        scanPlaceholder: 'https://example.com',
        runScan: 'Run Scan',
        whatYouGet: 'What you will get with this scan',
        strategicOutputs: 'Strategic Outputs',
        technicalAnalysis: 'Technical Analysis',
        yourProjects: 'Your Projects',
        sortByRecent: 'Sort by: Recent',
        syncingDatabase: 'Synchronizing Database...',
        noProjectsYet: 'No projects yet. Run a scan to get started.',
        viewFullReport: 'View Full Report',
        scanFailed: 'SCAN FAILED',
        scanActive: 'SCAN ACTIVE',
        analyzingUrl: 'Analyzing Target URL',
        errorDuringScan: 'Error During Scan',
        cancelScan: 'Cancel Scan',
        confirmDeleteScan: 'Are you sure you want to permanently delete this scan report?',
        deleteScanFailed: 'Failed to delete project. Please try again.',
        scanOutputExecutiveSummary: 'Executive Summary',
        scanOutputSnapshot: 'Business Snapshot & Goals',
        scanOutputFootprint: 'Digital Footprint Map',
        scanOutputActionPlan: '30-Day Action Plan',
        scanOutputSeo: 'SEO & Content Audit',
        scanOutputConversion: 'Conversion & UX Scan',
        scanOutputTechStack: 'Tech Stack Signals',
        scanOutputPerformance: 'Performance Metrics',
        noDescription: 'No description available.',

        // Deep Scan / Full Scan Report
        fullScanReport: 'Full Scan Report',
        reAnalyze: 'Re-Analyze',
        reAnalyzing: 'Re-analyzing...',
        addCompetitor: 'Add Competitor',
        searchSections: 'Search sections...',
        copySection: 'Copy Section',
        copiedToClipboard: 'Copied to clipboard!',
        exportDocx: 'Export DOCX',
        filterSections: 'Filter Sections',
        allSections: 'All Sections',
        marketingChecklist: 'Marketing Checklist',
        website: 'Website',
        marketing: 'Marketing',

        // Growth Mastermind
        growthMastermind: 'Growth Mastermind',
        growthMastermindSubtitle: 'Synthesize your Full Scan, Brand Strategy, and Personas into a highly tactical Marketing Masterplan.',
        newMasterplan: 'New Masterplan',
        noMasterplansYet: 'No Masterplans Yet',
        noMasterplansDesc: 'Hit the button above to generate your first tactical marketing masterplan.',
        masterplan: 'Masterplan',
        masterplanResults: 'Masterplan Results',
        objective: 'Objective:',
        primaryObjective: 'Primary Objective',
        customInstructions: 'Custom Instructions',
        customInstructionsPlaceholder: 'Add notes, specific instructions, or restrictions for this campaign (optional)...',
        configureMasterplan: 'Configure Masterplan',
        configureMasterplanDesc: 'Select your primary marketing objective. The AI will synthesize all project data to build the strategy.',
        synthesizingMasterplan: 'Synthesizing Masterplan',
        synthesizingMasterplanDesc: 'Analyzing scan report, persona segments, and brand voice arrays to engineer the optimal strategy...',
        generateStrategy: 'Generate Strategy',
        strategyGenerated: 'Strategy Masterplan generated successfully!',
        strategyDeleted: 'Strategy deleted successfully',
        deleteMasterplanTitle: 'Delete Masterplan?',
        deleteMasterplanDesc: 'This action cannot be undone. This masterplan will be permanently removed from your project.',

        // Content Generator
        contentGenerator: 'Content Generator',
        createContent: 'Create Content',
        savedCampaigns: 'Saved Campaigns',
        planning: 'Planning',
        research: 'Research',
        generateContent: 'Generate Content',
        campaignName: 'Campaign Name',
        contentType: 'Content Type',
        platform: 'Platform',
        tone: 'Tone',
        noCampaigns: 'No campaigns yet',
        newCampaign: 'New Campaign',
        saveDraft: 'Save Draft',
        includeCoverImage: 'Include Cover Image',
        generateVariations: 'Generate Social Media Variations',
        copyToClipboard: 'Copy to clipboard',

        // Web Growth Plan (SEO)
        webGrowthPlan: 'Web Growth Plan',
        webGrowthSubtitle: 'Research keywords, audit your technical SEO, and identify questions your market is asking.',
        keywordResearch: 'Keyword Research',
        technicalAudit: 'Technical Audit',
        questionsYourMarket: 'Questions Your Market Is Asking',
        generateKeywords: 'Generate Keywords',
        runAudit: 'Run Audit',
        generateQuestions: 'Generate Questions',

        // Workflows
        visualWorkflows: 'Visual Workflows',
        workflowsSubtitle: 'Design sequential sales funnels and operational automations.',
        newWorkflow: 'New Workflow',
        noWorkflows: 'No workflows yet',
        addNode: 'Add Node',
        saveWorkflow: 'Save Workflow',

        // Design Lab
        designLab: 'Design Lab',
        designLabSubtitle: 'Benchmarking & Mood Boards',
        generateVisuals: 'Generate Visuals',
        generateNewAsset: 'Generate New Asset',
        describeVisual: 'Describe the visual you want to generate...',
        searchAssets: 'Search assets...',
        competitorBenchmarking: 'Competitor UX Benchmarking',
        competitorBenchmarkingDesc: 'Latest scraped landing pages with automated pattern recognition.',
        visualMoodBoard: 'Visual Mood Board (AI Generated)',
        visualMoodBoardDesc: 'Concept exploration generated from your brand guidelines.',
        editGuidelines: 'Edit Guidelines',
        newPrompt: 'New Prompt',
        animateVeo: 'Animate (Veo)',
        useAsBase: 'Use as Base',
        availableOnGrowth: 'Available on Growth plan',
    },
    es: {
        ...landingTranslations.es,
        settings: 'Configuración',
        profile: 'Perfil',
        preferences: 'Preferencias',
        billing: 'Facturación',
        manageBilling: 'Gestionar Suscripción',
        saveChanges: 'Guardar Cambios',
        theme: 'Tema',
        language: 'Idioma',
        marketingEmails: 'Correos de Marketing',
        appNotifications: 'Notificaciones de la App',
        darkMode: 'Modo Oscuro',
        lightMode: 'Modo Claro',
        english: 'Inglés',
        spanish: 'Español',
        billingDesc: 'Gestiona tu ciclo de facturación y métodos de pago de forma segura vía Stripe.',
        profileDesc: 'Gestiona tu información personal.',
        preferencesDesc: 'Personaliza tu experiencia.',
        photo: 'Foto de Perfil',
        fullName: 'Nombre Completo',
        email: 'Correo Electrónico',

        // Global / General UI
        marketingPlatform: 'Plataforma de Marketing',
        aiTokensUsedThisMonth: 'Tokens de IA Usados Este Mes',
        signOut: 'Cerrar Sesión',
        signInToVultIntel: 'Iniciar Sesión en Vult Intel',
        cancel: 'Cancelar',
        save: 'Guardar',
        delete: 'Eliminar',
        edit: 'Editar',
        copy: 'Copiar',
        download: 'Descargar',
        export: 'Exportar',
        generate: 'Generar',
        generating: 'Generando...',
        loading: 'Cargando...',
        error: 'Error',
        success: 'Éxito',
        optional: 'Opcional',
        noProjectSelected: 'Sin Proyecto Activo',
        noProjectDesc: 'Selecciona o crea un proyecto desde el Centro de Proyectos.',
        viewReport: 'Ver Reporte',
        newItem: 'Nuevo',
        completed: 'Completado',
        overallProgress: 'Progreso General',

        // Sidebar Navigation
        navProjectsHub: 'Centro de Proyectos',
        navFullScanReport: 'Reporte de Escaneo Profundo',
        navContentGenerator: 'Generador de Contenido',
        navWebGrowthPlan: 'Plan Growth Web',
        navGlobalBrandStrategy: 'Estrategia de Marca',
        navPersonaStudio: 'Estudio de Personas',
        navCampaignArchitect: 'Arquitecto de Campañas',
        navVisualWorkflows: 'Flujos de Trabajo Visuales',

        // Command Center
        commandCenter: 'Centro de Comando',
        commandCenterDesc: 'Gestiona telemetría, alcance global y señales del sistema.',
        initializingCommandCenter: 'Inicializando Centro de Comando...',

        // Telemetry Hub
        telemetryHub: 'Centro de Telemetría y Uso',
        aiPower: 'Poder de IA',
        tokensGenerated: 'Tokens Generados',
        deepScans: 'Escaneos Profundos',
        imagesGenerated: 'Imágenes Generadas',
        activeCache: 'Caché Activo',
        purgeCache: 'Purgar Caché',
        storageManager: 'Gestor de Almacenamiento',
        activeProjects: 'Proyectos Activos',
        campaignAssets: 'Activos de Campaña',
        clearOldAssets: 'Limpiar Activos Antiguos',

        // Notification Center
        notificationCenter: 'Centro de Notificaciones Inteligente',
        usageQuotas: 'Uso y Cuotas',
        alertAt: 'Alerta al',
        utilization: 'de Utilización',
        systemOperations: 'Operaciones de IA y Sistema',
        deepScanFinished: 'Escaneo Profundo Finalizado',
        urlReadFailure: 'Fallo de Lectura de URL',
        docsExportReady: 'Exportación a Docs Lista',

        // Subscription Studio
        subscriptionStudio: 'Estudio de Suscripciones y Complementos',
        activeTier: 'Nivel Activo',
        growthPlan: 'Plan Growth',
        projectsIncluded: 'Proyectos Activos Incluidos',
        advancedPersonas: 'Cerebros de Persona Avanzados',
        upgradeToAgency: 'Mejorar a Plan Agencia',
        veoStudio: 'Paquete Veo Studio',
        veoPrice: '+49 USD / MES',
        veoDesc: 'Desbloquea generación de video de alta fidelidad para todos los activos.',
        status: 'Estado',
        lockedFeature: 'Función Bloqueada',
        buyAddon: 'Comprar Complemento',
        processing: 'Procesando...',
        redirecting: 'Redirigiendo a Stripe...',

        // Global Preferences
        globalPreferences: 'Preferencias Globales y Apariencia',
        themeEngine: 'Motor de Temas',
        dark: 'Oscuro',
        light: 'Claro',
        systemLanguage: 'Idioma del Sistema',
        englishGlobal: 'Inglés',
        spanishIberian: 'Español',

        // AI Chat Bot
        chatAssistant: 'Asistente de IA',
        chatContext: 'Contexto: ',
        chatNoContext: 'Sin contexto de proyecto',
        chatClearHistory: 'Limpiar historial',
        chatClearConfirm: '¿Estás seguro de que quieres limpiar el historial de este chat?',
        chatWelcomeTitle: '¿En qué puedo ayudarte hoy?',
        chatWelcomeDesc: 'Tengo acceso a la estrategia de tu marca, personas y pilares. Aprovecha mi conocimiento para optimizar tu contenido.',
        chatPlaceholder: 'Escribe un mensaje...',
        chatFooterNote: 'Solo se envían los últimos mensajes para optimizar costos.',
        chatError: 'Lo siento, hubo un error al procesar tu solicitud. Por favor intenta de nuevo.',

        // Projects Hub (Pulse)
        projectsHub: 'Centro de Proyectos',
        projectsHubSubtitle: 'Gestiona escaneos e inteligencia de marketing',
        startMarketingScan: 'Iniciar un Escaneo de Marketing',
        scanSubtitle: 'Ingresa la URL de un competidor para extraer inteligencia profunda.',
        scanPlaceholder: 'https://ejemplo.com',
        runScan: 'Ejecutar Escaneo',
        whatYouGet: 'Qué obtendrás con este escaneo',
        strategicOutputs: 'Resultados Estratégicos',
        technicalAnalysis: 'Análisis Técnico',
        yourProjects: 'Tus Proyectos',
        sortByRecent: 'Ordenar por: Reciente',
        syncingDatabase: 'Sincronizando Base de Datos...',
        noProjectsYet: 'Sin proyectos aún. Ejecuta un escaneo para comenzar.',
        viewFullReport: 'Ver Reporte Completo',
        scanFailed: 'ESCANEO FALLIDO',
        scanActive: 'ESCANEO ACTIVO',
        analyzingUrl: 'Analizando URL Objetivo',
        errorDuringScan: 'Error Durante el Escaneo',
        cancelScan: 'Cancelar Escaneo',
        confirmDeleteScan: '¿Estás seguro de que quieres eliminar permanentemente este reporte?',
        deleteScanFailed: 'Error al eliminar el proyecto. Por favor intenta de nuevo.',
        scanOutputExecutiveSummary: 'Resumen Ejecutivo',
        scanOutputSnapshot: 'Diagnóstico del Negocio y Objetivos',
        scanOutputFootprint: 'Mapa de Huella Digital',
        scanOutputActionPlan: 'Plan de Acción a 30 Días',
        scanOutputSeo: 'Auditoría SEO y de Contenido',
        scanOutputConversion: 'Escaneo de Conversión y UX',
        scanOutputTechStack: 'Señales del Stack Tecnológico',
        scanOutputPerformance: 'Métricas de Rendimiento',
        noDescription: 'Sin descripción disponible.',

        // Deep Scan / Full Scan Report
        fullScanReport: 'Reporte de Escaneo Profundo',
        reAnalyze: 'Re-Analizar',
        reAnalyzing: 'Re-analizando...',
        addCompetitor: 'Añadir Competidor',
        searchSections: 'Buscar secciones...',
        copySection: 'Copiar Sección',
        copiedToClipboard: '¡Copiado al portapapeles!',
        exportDocx: 'Exportar DOCX',
        filterSections: 'Filtrar Secciones',
        allSections: 'Todas las Secciones',
        marketingChecklist: 'Checklist de Marketing',
        website: 'Sitio Web',
        marketing: 'Marketing',

        // Growth Mastermind
        growthMastermind: 'Growth Mastermind',
        growthMastermindSubtitle: 'Sintetiza tu Escaneo Profundo, Estrategia de Marca y Personas en un Plan de Marketing altamente táctico.',
        newMasterplan: 'Nuevo Masterplan',
        noMasterplansYet: 'Sin Masterplans Aún',
        noMasterplansDesc: 'Haz clic en el botón de arriba para generar tu primer masterplan de marketing táctico.',
        masterplan: 'Masterplan',
        masterplanResults: 'Resultados del Masterplan',
        objective: 'Objetivo:',
        primaryObjective: 'Objetivo Principal',
        customInstructions: 'Instrucciones Personalizadas',
        customInstructionsPlaceholder: 'Añade notas, instrucciones específicas, o restricciones para esta campaña (opcional)...',
        configureMasterplan: 'Configurar Masterplan',
        configureMasterplanDesc: 'Selecciona tu objetivo principal de marketing. La IA sintetizará todos los datos del proyecto para construir la estrategia.',
        synthesizingMasterplan: 'Sintetizando Masterplan',
        synthesizingMasterplanDesc: 'Analizando reporte de escaneo, segmentos de persona y arrays de voz de marca para diseñar la estrategia óptima...',
        generateStrategy: 'Generar Estrategia',
        strategyGenerated: '¡Masterplan de Estrategia generado exitosamente!',
        strategyDeleted: 'Estrategia eliminada exitosamente',
        deleteMasterplanTitle: '¿Eliminar Masterplan?',
        deleteMasterplanDesc: 'Esta acción no se puede deshacer. Este masterplan será eliminado permanentemente de tu proyecto.',

        // Content Generator
        contentGenerator: 'Generador de Contenido',
        createContent: 'Crear Contenido',
        savedCampaigns: 'Campañas Guardadas',
        planning: 'Planificación',
        research: 'Investigación',
        generateContent: 'Generar Contenido',
        campaignName: 'Nombre de Campaña',
        contentType: 'Tipo de Contenido',
        platform: 'Plataforma',
        tone: 'Tono',
        noCampaigns: 'Sin campañas aún',
        newCampaign: 'Nueva Campaña',
        saveDraft: 'Guardar Borrador',
        includeCoverImage: 'Incluir Imagen de Portada',
        generateVariations: 'Generar Variaciones para Redes Sociales',
        copyToClipboard: 'Copiar al portapapeles',

        // Web Growth Plan (SEO)
        webGrowthPlan: 'Plan Growth Web',
        webGrowthSubtitle: 'Investiga keywords, audita tu SEO técnico e identifica preguntas que hace tu mercado.',
        keywordResearch: 'Investigación de Keywords',
        technicalAudit: 'Auditoría Técnica',
        questionsYourMarket: 'Preguntas que Hace tu Mercado',
        generateKeywords: 'Generar Keywords',
        runAudit: 'Ejecutar Auditoría',
        generateQuestions: 'Generar Preguntas',

        // Workflows
        visualWorkflows: 'Flujos de Trabajo Visuales',
        workflowsSubtitle: 'Diseña embudos de ventas secuenciales y automatizaciones operativas.',
        newWorkflow: 'Nuevo Flujo',
        noWorkflows: 'Sin flujos aún',
        addNode: 'Añadir Nodo',
        saveWorkflow: 'Guardar Flujo',

        // Design Lab
        designLab: 'Design Lab',
        designLabSubtitle: 'Benchmarking y Mood Boards',
        generateVisuals: 'Generar Visuales',
        generateNewAsset: 'Generar Nuevo Asset',
        describeVisual: 'Describe el visual que quieres generar...',
        searchAssets: 'Buscar assets...',
        competitorBenchmarking: 'Benchmarking UX de Competidores',
        competitorBenchmarkingDesc: 'Últimas landing pages capturadas con reconocimiento de patrones automatizado.',
        visualMoodBoard: 'Mood Board Visual (Generado por IA)',
        visualMoodBoardDesc: 'Exploración de conceptos generada desde las guías de tu marca.',
        editGuidelines: 'Editar Guías',
        newPrompt: 'Nuevo Prompt',
        animateVeo: 'Animar (Veo)',
        useAsBase: 'Usar como Base',
        availableOnGrowth: 'Disponible en plan Growth',
    }
};



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

    const updateNotificationPref = (key: keyof NotificationPrefs, value: boolean) => {
        setNotificationPrefs(prev => ({ ...prev, [key]: value }));
    };

    const t = (key: string) => {
        const safeLang = translations[language as keyof typeof translations] || translations.en;
        return (safeLang as any)[key] || key;
    };

    return (
        <SettingsContext.Provider
            value={{
                theme, language, marketingEmails, appNotifications, notificationPrefs,
                setTheme, setLanguage, setMarketingEmails, setAppNotifications,
                updateNotificationPref, saveSettings, isSyncing, t
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
