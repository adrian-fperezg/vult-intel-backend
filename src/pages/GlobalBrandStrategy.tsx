import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    Target,
    Users,
    Mic2,
    Plus,
    X,
    Pencil,
    Trash2,
    Save,
    Sparkles,
    ChevronDown,
    AlertTriangle,
    CheckCircle2,
    Hash,
    Globe,
    Briefcase,
    DollarSign,
    MapPin,
    Heart,
    Zap,
    Ban,
    ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    ContentPillar,
    BuyerPersona,
    BrandVoice,
    Archetype,
    JUNGIAN_ARCHETYPES,
    saveContentPillar,
    getContentPillars,
    updateContentPillar,
    deleteContentPillar,
    saveBuyerPersona,
    getBuyerPersonas,
    updateBuyerPersona,
    deleteBuyerPersona,
    saveBrandVoice,
    getBrandVoices,
    updateBrandVoice,
    deleteBrandVoice,
    ContextFile,
    saveContextFile,
    getContextFiles,
    deleteContextFile,
} from '@/services/brandStrategyService';
import { generatePersonaFromReport, generateBrandStrategyFromReport } from '@/services/ai';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { FileText, Upload, Link as LinkIcon, ExternalLink, Library, Layout, Loader2, Mic, Edit } from 'lucide-react';

type Tab = 'pillars' | 'personas' | 'voice' | 'context';

const EMPTY_PILLAR: Omit<ContentPillar, 'id' | 'createdAt' | 'projectId' | 'userId'> = {
    name: '',
    coreTheme: '',
    keywords: [],
    aiDirective: '',
    visualStyle: '',
};

const EMPTY_PERSONA: Omit<BuyerPersona, 'id' | 'createdAt' | 'projectId' | 'userId'> = {
    name: '',
    ageRange: '',
    gender: '',
    location: '',
    jobTitle: '',
    income: '',
    goals: '',
    painPoints: '',
    objections: '',
    mediaHabits: '',
    preferredTone: '',
    triggerWords: '',
};

const DEFAULT_VOICE: Omit<BrandVoice, 'id' | 'projectId' | 'updatedAt' | 'userId'> = {
    name: '',
    valueProposition: '',
    archetype: 'The Creator',
    formalityCasual: 50,
    authoritativeEmpathetic: 50,
    seriousPlayful: 40,
    vocabularyAllowlist: [],
    vocabularyBanlist: [],
};

// Pillar color palette
const PILLAR_COLORS = [
    'from-blue-500/20 to-blue-600/5 border-blue-500/30',
    'from-purple-500/20 to-purple-600/5 border-purple-500/30',
    'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30',
    'from-amber-500/20 to-amber-600/5 border-amber-500/30',
    'from-rose-500/20 to-rose-600/5 border-rose-500/30',
    'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30',
    'from-teal-500/20 to-teal-600/5 border-teal-500/30',
];

const PILLAR_ICONS = ['🎯', '💡', '🚀', '🌟', '🔥', '💎', '⚡'];

function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function ToneSlider({ label, leftLabel, rightLabel, value, onChange }: {
    label: string;
    leftLabel: string;
    rightLabel: string;
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-400">{label}</span>
                <span className="text-sm text-slate-500">{value}%</span>
            </div>
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20 text-right shrink-0">{leftLabel}</span>
                <div className="relative flex-1 h-2 bg-white/10 rounded-full">
                    <div
                        className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all"
                        style={{ width: `${value}%` }}
                    />
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={value}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                    />
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-blue-500 shadow-lg pointer-events-none transition-all"
                        style={{ left: `calc(${value}% - 8px)` }}
                    />
                </div>
                <span className="text-xs text-slate-500 w-20 shrink-0">{rightLabel}</span>
            </div>
        </div>
    );
}

export default function GlobalBrandStrategy() {
    const { currentUser } = useAuth();
    const { activeProjectId, refreshProjectData } = useProject();

    const [activeTab, setActiveTab] = useState<Tab>('pillars');
    const projectId = activeProjectId;

    // Reset all states when project changes
    useEffect(() => {
        if (projectId) {
            setPillars([]);
            setPersonas([]);
            setVoices([]);
            setContextFiles([]);
            loadPillars();
            loadPersonas();
            loadVoices();
            loadContextFiles();
        }
    }, [projectId]);

    // ── Content Pillars State ──────────────────────────────────────────────────
    const [pillars, setPillars] = useState<ContentPillar[]>([]);
    const [isPillarModalOpen, setIsPillarModalOpen] = useState(false);
    const [editingPillar, setEditingPillar] = useState<ContentPillar | null>(null);
    const [pillarForm, setPillarForm] = useState(EMPTY_PILLAR);
    const [pillarKeywordInput, setPillarKeywordInput] = useState('');
    const [isSavingPillar, setIsSavingPillar] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'pillar' | 'persona' | 'voice'; id: string; name?: string } | null>(null);
    const [isLoadingPillars, setIsLoadingPillars] = useState(true);

    const loadPillars = useCallback(async () => {
        if (!projectId) {
            setPillars([]);
            setIsLoadingPillars(false);
            return;
        }
        setIsLoadingPillars(true);
        try { setPillars(await getContentPillars(projectId)); } catch (e) { console.error(e); }
        finally { setIsLoadingPillars(false); }
    }, [projectId]);

    useEffect(() => { loadPillars(); }, [loadPillars]);

    const openCreatePillar = () => {
        setEditingPillar(null);
        setPillarForm(EMPTY_PILLAR);
        setPillarKeywordInput('');
        setIsPillarModalOpen(true);
    };

    const openEditPillar = (p: ContentPillar) => {
        setEditingPillar(p);
        setPillarForm({ name: p.name, coreTheme: p.coreTheme, keywords: [...p.keywords], aiDirective: p.aiDirective, visualStyle: p.visualStyle || '' });
        setPillarKeywordInput('');
        setIsPillarModalOpen(true);
    };

    const handleSavePillar = async () => {
        if (!pillarForm.name.trim() || !projectId) return;
        setIsSavingPillar(true);
        try {
            if (editingPillar) {
                await updateContentPillar(projectId, editingPillar.id, pillarForm);
                setPillars(prev => prev.map(p => p.id === editingPillar.id ? { ...p, ...pillarForm } : p));
            } else {
                const id = await saveContentPillar(projectId, { ...pillarForm });
                setPillars(prev => [...prev, { id, projectId, userId: currentUser?.uid || '', ...pillarForm, createdAt: Date.now() }]);
            }
            setIsPillarModalOpen(false);
            await refreshProjectData();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Error saving pillar');
        } finally {
            setIsSavingPillar(false);
        }
    };

    const handleDeletePillar = async (id: string) => {
        if (!projectId) return;
        await deleteContentPillar(projectId, id);
        setPillars(prev => prev.filter(p => p.id !== id));
        setDeleteConfirm(null);
        await refreshProjectData();
    };

    const addKeyword = () => {
        const kw = pillarKeywordInput.trim();
        if (kw && !pillarForm.keywords.includes(kw)) {
            setPillarForm(f => ({ ...f, keywords: [...f.keywords, kw] }));
        }
        setPillarKeywordInput('');
    };

    // ── Buyer Personas State ──────────────────────────────────────────────────
    const [personas, setPersonas] = useState<BuyerPersona[]>([]);
    const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
    const [editingPersona, setEditingPersona] = useState<BuyerPersona | null>(null);
    const [personaForm, setPersonaForm] = useState(EMPTY_PERSONA);
    const [isSavingPersona, setIsSavingPersona] = useState(false);
    const [isAutoFilling, setIsAutoFilling] = useState(false);
    const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
    const [isLoadingPersonas, setIsLoadingPersonas] = useState(true);
    const [activePersonaCard, setActivePersonaCard] = useState<string | null>(null);
    const { activeProject } = useProject();

    const handleAutoFillPersona = async () => {
        if (!activeProject?.project?.sections || activeProject.project.sections.length === 0) {
            alert("No Deep Scan data found. Run a Deep Scan first.");
            return;
        }

        setIsAutoFilling(true);
        try {
            const reportText = activeProject.project.sections.map(s => `## ${s.title}\n${s.content}`).join('\n\n');
            const data = await generatePersonaFromReport(reportText, currentUser?.uid);

            // Map the returned partial data to the form, preserving name if they already started typing it.
            setPersonaForm(prev => ({
                ...prev,
                name: prev.name || data.name || '',
                ageRange: data.ageRange || '',
                gender: data.gender || '',
                location: data.location || '',
                jobTitle: data.jobTitle || '',
                income: data.income || '',
                goals: data.goals || '',
                painPoints: data.painPoints || '',
                objections: data.objections || '',
                mediaHabits: data.mediaHabits || '',
                preferredTone: data.preferredTone || '',
                triggerWords: data.triggerWords || '',
            }));
        } catch (e: any) {
            alert(e.message || "Failed to auto-fill persona.");
        } finally {
            setIsAutoFilling(false);
        }
    };

    const loadPersonas = useCallback(async () => {
        if (!projectId) {
            setPersonas([]);
            setIsLoadingPersonas(false);
            return;
        }
        setIsLoadingPersonas(true);
        try { setPersonas(await getBuyerPersonas(projectId)); } catch (e) { console.error(e); }
        finally { setIsLoadingPersonas(false); }
    }, [projectId]);

    useEffect(() => { loadPersonas(); }, [loadPersonas]);

    const openCreatePersona = () => {
        setEditingPersona(null);
        setPersonaForm(EMPTY_PERSONA);
        setIsPersonaModalOpen(true);
    };

    const openEditPersona = (p: BuyerPersona) => {
        setEditingPersona(p);
        setPersonaForm({
            name: p.name, ageRange: p.ageRange, gender: p.gender, location: p.location,
            jobTitle: p.jobTitle, income: p.income, goals: p.goals, painPoints: p.painPoints,
            objections: p.objections, mediaHabits: p.mediaHabits,
            preferredTone: p.preferredTone, triggerWords: p.triggerWords,
        });
        setIsPersonaModalOpen(true);
    };

    const handleSavePersona = async () => {
        if (!personaForm.name.trim() || !projectId) return;
        setIsSavingPersona(true);
        try {
            if (editingPersona) {
                await updateBuyerPersona(projectId, editingPersona.id, personaForm);
                setPersonas(prev => prev.map(p => p.id === editingPersona.id ? { ...p, ...personaForm } : p));
            } else {
                const id = await saveBuyerPersona(projectId, { ...personaForm, projectId });
                setPersonas(prev => [...prev, { id, projectId, userId: currentUser?.uid || '', ...personaForm, createdAt: Date.now() }]);
            }
            setIsPersonaModalOpen(false);
            await refreshProjectData();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Error saving persona');
        } finally {
            setIsSavingPersona(false);
        }
    };

    const handleDeletePersona = async (id: string) => {
        if (!projectId) return;
        await deleteBuyerPersona(projectId, id);
        setPersonas(prev => prev.filter(p => p.id !== id));
        setDeleteConfirm(null);
        await refreshProjectData();
    };

    // ── Brand Voice State ──────────────────────────────────────────────────────
    const [voices, setVoices] = useState<BrandVoice[]>([]);
    const [isLoadingVoices, setIsLoadingVoices] = useState(true);
    const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
    const [editingVoice, setEditingVoice] = useState<BrandVoice | null>(null);
    const [voiceForm, setVoiceForm] = useState(DEFAULT_VOICE);
    const [isSavingVoice, setIsSavingVoice] = useState(false);

    // Derived selected voice (if you want to maintain a concept of an 'active/selected' voice later, default to first for now or null)
    const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);

    const loadVoices = useCallback(async () => {
        if (!projectId) {
            setVoices([]);
            setIsLoadingVoices(false);
            return;
        }
        setIsLoadingVoices(true);
        try {
            const data = await getBrandVoices(projectId);
            setVoices(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingVoices(false);
        }
    }, [projectId]);

    useEffect(() => { loadVoices(); }, [loadVoices]);

    const openCreateVoice = () => {
        setEditingVoice(null);
        setVoiceForm(DEFAULT_VOICE);
        setIsVoiceModalOpen(true);
    };

    const openEditVoice = (v: BrandVoice) => {
        setEditingVoice(v);
        setVoiceForm({
            name: v.name,
            valueProposition: v.valueProposition,
            archetype: v.archetype,
            formalityCasual: v.formalityCasual,
            authoritativeEmpathetic: v.authoritativeEmpathetic,
            seriousPlayful: v.seriousPlayful,
            vocabularyAllowlist: v.vocabularyAllowlist,
            vocabularyBanlist: v.vocabularyBanlist,
        });
        setIsVoiceModalOpen(true);
    };

    const handleSaveVoice = async () => {
        if (!voiceForm.name.trim() || !projectId) return;
        setIsSavingVoice(true);
        try {
            if (editingVoice) {
                await updateBrandVoice(projectId, editingVoice.id, voiceForm);
                setVoices(prev => prev.map(v => v.id === editingVoice.id ? { ...v, ...voiceForm } : v));
            } else {
                const id = await saveBrandVoice(projectId, { ...voiceForm });
                setVoices(prev => [...prev, { id, projectId, userId: currentUser?.uid || '', ...voiceForm, createdAt: Date.now(), updatedAt: Date.now() }]);
            }
            setIsVoiceModalOpen(false);
            await refreshProjectData();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Error saving brand voice');
        } finally {
            setIsSavingVoice(false);
        }
    };

    const handleDeleteVoice = async (id: string) => {
        if (!projectId) return;
        await deleteBrandVoice(projectId, id);
        setVoices(prev => prev.filter(v => v.id !== id));
        setDeleteConfirm(null);
        await refreshProjectData();
    };

    // ── Context Library State ────────────────────────────────────────────────
    const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
    const [isLoadingContext, setIsLoadingContext] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useCallback((node: HTMLInputElement | null) => {
        if (node !== null) {
            // we can use this ref if needed
        }
    }, []);

    const loadContextFiles = useCallback(async () => {
        if (!projectId) {
            setContextFiles([]);
            setIsLoadingContext(false);
            return;
        }
        setIsLoadingContext(true);
        try {
            const files = await getContextFiles(projectId);
            setContextFiles(files);
        } catch (e) { console.error(e); }
        finally { setIsLoadingContext(false); }
    }, [projectId]);

    useEffect(() => { loadContextFiles(); }, [loadContextFiles]);

    // ── Unified Master AI Generation ───────────────────────────────────────────
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);

    const handleGenerateEcosystem = async () => {
        if (!activeProject?.project?.sections || activeProject.project.sections.length === 0) {
            alert("No Deep Scan data found. Run a Deep Scan first to generate strategies.");
            return;
        }

        setIsGeneratingAll(true);
        try {
            const sysLang = localStorage.getItem('vult_language') || 'es';
            const fullScanText = activeProject.project.sections.map((s: any) => `=== ${s.title} ===\n${s.content}`).join('\n\n');

            // Trigger AI functions in parallel
            const [strategyData, personaData] = await Promise.all([
                generateBrandStrategyFromReport(fullScanText, sysLang, currentUser?.uid),
                generatePersonaFromReport(fullScanText, currentUser?.uid)
            ]);

            // Setup Persona Save
            const finalPersona = { ...EMPTY_PERSONA, ...personaData, projectId };
            const personaPromise = saveBuyerPersona(projectId, finalPersona as any).then(id => {
                setPersonas(prev => [...prev, { id, projectId, userId: currentUser?.uid || '', ...finalPersona, createdAt: Date.now() }]);
            });

            // Setup Voice Save
            const voicePromise = strategyData.brandVoice ? saveBrandVoice(projectId, {
                ...DEFAULT_VOICE,
                ...strategyData.brandVoice,
                name: strategyData.brandVoice.name || 'AI Generated Voice'
            }).then(id => {
                setVoices(prev => [...prev, {
                    id,
                    projectId,
                    userId: currentUser?.uid || '',
                    ...DEFAULT_VOICE, ...strategyData.brandVoice,
                    name: strategyData.brandVoice.name || 'AI Generated Voice',
                    updatedAt: Date.now()
                }]);
            }) : Promise.resolve();

            // Setup Pillars Save
            const pillarsPromise = Array.isArray(strategyData.contentPillars) ? (async () => {
                const newPillarsPromises = strategyData.contentPillars.map((cp: any, index: number) => {
                    if (pillars.length + index >= 7) return null;
                    const partialPillar = {
                        name: cp.name || '',
                        coreTheme: cp.coreTheme || '',
                        keywords: cp.keywords || [],
                        aiDirective: cp.aiDirective || '',
                        visualStyle: cp.visualStyle || ''
                    };
                    return saveContentPillar(projectId, partialPillar);
                }).filter(Boolean);

                const createdPillars = await Promise.all(newPillarsPromises);
                const successfulPillars = createdPillars.filter(Boolean) as ContentPillar[];
                setPillars(prev => [...prev, ...successfulPillars].slice(0, 7));
            })() : Promise.resolve();

            await Promise.all([personaPromise, voicePromise, pillarsPromise]);

        } catch (error) {
            console.error("Failed to generate brand strategy ecosystem:", error);
            const errorMsg = localStorage.getItem('vult_language') === 'en'
                ? "There was an error generating the brand strategy. Please try again later."
                : "Hubo un error al generar la estrategia de marca. Inténtalo más tarde.";
            alert(errorMsg);
        } finally {
            setIsGeneratingAll(false);
            await refreshProjectData();
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !projectId) return;

        setIsUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const content = await file.text();
                await saveContextFile(projectId, {
                    name: file.name,
                    content,
                    type: file.type || 'text/plain',
                });
            }
            await loadContextFiles();
        } catch (err) {
            alert('Error uploading files');
            console.error(err);
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };
    const handleDeleteFile = async (id: string) => {
        if (!projectId) return;
        try {
            await deleteContextFile(projectId, id);
            setContextFiles(prev => prev.filter(f => f.id !== id));
        } catch (e) { console.error(e); }
    };

    return (
        <div className="h-screen flex flex-col bg-background-dark text-white overflow-hidden">
            {/* Page Header */}
            <div className="flex-shrink-0 border-b border-white/5 bg-background-dark px-8 py-5">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl border border-white/10">
                                <Sparkles className="size-5 text-blue-400" />
                            </div>
                            <h1 className="text-2xl font-bold text-white">Global Brand Strategy</h1>
                        </div>
                        <p className="text-sm text-slate-500 ml-12">The single source of truth for all AI generation across Vult Intel.</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                            <div className="size-2 bg-emerald-400 rounded-full animate-pulse" />
                            <span className="text-sm font-medium text-emerald-400">Live — AI reads this</span>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-5 bg-surface-dark rounded-xl p-1 border border-white/8 w-fit">
                    {([
                        { id: 'pillars', label: 'Content Pillars', icon: Target, count: pillars.length, max: 7 },
                        { id: 'personas', label: 'Buyer Personas', icon: Users, count: personas.length, max: 10 },
                        { id: 'voice', label: 'Brand Voice', icon: Mic2, count: null, max: null },
                        { id: 'context', label: 'Context Library', icon: Library, count: contextFiles.length, max: 20 },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                                activeTab === tab.id
                                    ? "bg-white/10 text-white shadow-sm"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <tab.icon className="size-4" />
                            {tab.label}
                            {tab.count !== null && (
                                <span className={cn(
                                    "px-2 py-0.5 rounded-full text-xs font-bold",
                                    activeTab === tab.id ? "bg-blue-500/20 text-blue-300" : "bg-white/5 text-slate-500"
                                )}>
                                    {tab.count}/{tab.max}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>



            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {!projectId ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
                        <Layout className="size-16 text-slate-500" />
                        <h2 className="text-xl font-bold text-white">Select a Project</h2>
                        <p className="text-slate-400">Choose an active project from the top navigation to view and manage its brand strategy.</p>
                    </div>
                ) : (
                    <>
                        {/* ── CONTENT PILLARS ─────────────────────────────────────────────── */}
                        {activeTab === 'pillars' && (
                            <div className="p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Content Pillars</h2>
                                        <p className="text-sm text-slate-500 mt-0.5">Define the core themes the AI must stay within. Max 7 pillars.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleGenerateEcosystem}
                                            disabled={isGeneratingAll}
                                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-md active:scale-95 text-sm h-[38px] min-w-max"
                                            title={localStorage.getItem('vult_language') === 'en' ? 'Generate ecosystem from report' : 'Generar ecosistema del reporte'}
                                        >
                                            {isGeneratingAll ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                            {isGeneratingAll
                                                ? (localStorage.getItem('vult_language') === 'en' ? 'Generating ecosystem...' : 'Generando ecosistema...')
                                                : (localStorage.getItem('vult_language') === 'en' ? '✨ Auto-Generate Pillars' : '✨ Autogenerar Pilares')}
                                        </button>
                                        <button
                                            onClick={openCreatePillar}
                                            disabled={pillars.length >= 7}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm h-[38px]"
                                        >
                                            <Plus className="size-4" /> Add Pillar
                                        </button>
                                    </div>
                                </div>

                                {isLoadingPillars ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {[1, 2, 3].map(i => <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse" />)}
                                    </div>
                                ) : pillars.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-slate-600 gap-4">
                                        <Target className="size-12 opacity-20" />
                                        <div className="text-center">
                                            <p className="text-base font-medium text-slate-500">No content pillars yet</p>
                                            <p className="text-sm mt-1 max-w-sm">Pillars tell the AI what themes to stay within. Add your first pillar to get started.</p>
                                        </div>
                                        <button onClick={openCreatePillar} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors text-sm mt-2">
                                            <Plus className="size-4" /> Create First Pillar
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {pillars.map((pillar, idx) => (
                                            <motion.div
                                                key={pillar.id}
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={cn(
                                                    "rounded-2xl border bg-gradient-to-br p-5 flex flex-col gap-3 group hover:scale-[1.01] transition-transform cursor-default",
                                                    PILLAR_COLORS[idx % PILLAR_COLORS.length]
                                                )}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-2xl">{PILLAR_ICONS[idx % PILLAR_ICONS.length]}</span>
                                                        <h3 className="text-base font-bold text-white leading-tight">{pillar.name}</h3>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => openEditPillar(pillar)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                                                            <Pencil className="size-3.5" />
                                                        </button>
                                                        <button onClick={() => setDeleteConfirm({ type: 'pillar', id: pillar.id, name: pillar.name })} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                                                            <Trash2 className="size-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">{pillar.coreTheme}</p>
                                                {pillar.keywords.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                                                        {pillar.keywords.slice(0, 4).map(kw => (
                                                            <span key={kw} className="px-2 py-1 bg-white/10 rounded-full text-[11px] text-slate-300 flex items-center gap-1">
                                                                <Hash className="size-3 opacity-60" />{kw}
                                                            </span>
                                                        ))}
                                                        {pillar.keywords.length > 4 && <span className="text-xs text-slate-500">+{pillar.keywords.length - 4}</span>}
                                                    </div>
                                                )}
                                                {pillar.aiDirective && (
                                                    <div className="pt-3 border-t border-white/10 mt-2">
                                                        <p className="text-xs text-slate-500 italic line-clamp-2">"{pillar.aiDirective}"</p>
                                                    </div>
                                                )}
                                            </motion.div>
                                        ))}

                                        {/* Add more ghost cards */}
                                        {pillars.length < 7 && (
                                            <button
                                                onClick={openCreatePillar}
                                                className="rounded-2xl border border-dashed border-white/10 hover:border-blue-500/30 p-5 flex flex-col items-center justify-center gap-2 text-slate-600 hover:text-blue-400 transition-all min-h-[180px]"
                                            >
                                                <Plus className="size-6" />
                                                <span className="text-sm font-medium">Add Pillar</span>
                                                <span className="text-xs opacity-60">{7 - pillars.length} remaining</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── BUYER PERSONAS ───────────────────────────────────────────────── */}
                        {activeTab === 'personas' && (
                            <div className="p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Buyer Personas</h2>
                                        <p className="text-sm text-slate-500 mt-0.5">Rich customer profiles. The AI uses these to adapt vocabulary, tone, and emotional triggers. Max 10.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleGenerateEcosystem}
                                            disabled={isGeneratingAll}
                                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-md active:scale-95 text-sm h-[38px] min-w-max"
                                            title={localStorage.getItem('vult_language') === 'en' ? 'Generate ecosystem from report' : 'Generar ecosistema del reporte'}
                                        >
                                            {isGeneratingAll ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                            {isGeneratingAll
                                                ? (localStorage.getItem('vult_language') === 'en' ? 'Generating ecosystem...' : 'Generando ecosistema...')
                                                : (localStorage.getItem('vult_language') === 'en' ? '✨ Auto-Generate Personas' : '✨ Autogenerar Personas')}
                                        </button>
                                        <button
                                            onClick={openCreatePersona}
                                            disabled={personas.length >= 10}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm h-[38px]"
                                        >
                                            <Plus className="size-4" /> Add Persona
                                        </button>
                                    </div>
                                </div>

                                {isLoadingPersonas ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {[1, 2, 3].map(i => <div key={i} className="h-64 bg-white/5 rounded-2xl animate-pulse" />)}
                                    </div>
                                ) : personas.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-slate-600 gap-4">
                                        <Users className="size-12 opacity-20" />
                                        <div className="text-center">
                                            <p className="text-base font-medium text-slate-500">No buyer personas yet</p>
                                            <p className="text-sm mt-1 max-w-sm">Personas tell the AI exactly who it's writing for. Create your first to unlock persona-driven AI generation.</p>
                                        </div>
                                        <button onClick={openCreatePersona} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors text-sm mt-2">
                                            <Plus className="size-4" /> Create First Persona
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {personas.map(persona => (
                                            <motion.div
                                                key={persona.id}
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="bg-surface-dark border border-white/8 rounded-2xl overflow-hidden group hover:border-white/15 transition-colors"
                                            >
                                                {/* Avatar Header */}
                                                <div className="bg-gradient-to-br from-purple-500/15 to-blue-500/10 p-5 flex items-start justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                                            {getInitials(persona.name)}
                                                        </div>
                                                        <div>
                                                            <h3 className="text-base font-bold text-white">{persona.name}</h3>
                                                            <p className="text-xs text-slate-400">{persona.jobTitle || 'No job title'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => openEditPersona(persona)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                                                            <Pencil className="size-3.5" />
                                                        </button>
                                                        <button onClick={() => setDeleteConfirm({ type: 'persona', id: persona.id, name: persona.name })} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                                                            <Trash2 className="size-3.5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Info Grid & Actions */}
                                                <div className="p-5 flex flex-col items-center gap-4">
                                                    <Link
                                                        to="/persona-studio"
                                                        state={{ selectedPersonaId: persona.id }}
                                                        className="w-full text-sm font-semibold flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-md active:scale-95"
                                                    >
                                                        Open in Studio <ArrowRight className="size-4" />
                                                    </Link>
                                                </div>
                                            </motion.div>
                                        ))}

                                        {personas.length < 10 && (
                                            <button
                                                onClick={openCreatePersona}
                                                className="rounded-2xl border border-dashed border-white/10 hover:border-purple-500/30 p-5 flex flex-col items-center justify-center gap-2 text-slate-600 hover:text-purple-400 transition-all min-h-[230px]"
                                            >
                                                <Plus className="size-6" />
                                                <span className="text-sm font-medium">Add Persona</span>
                                                <span className="text-xs opacity-60">{10 - personas.length} remaining</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── BRAND VOICE MANAGER ─────────────────────────────────────────────────── */}
                        {activeTab === 'voice' && (
                            <div className="p-8 max-w-5xl mx-auto space-y-8">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            <Mic className="text-blue-400 size-6" /> Brand Voice Library
                                        </h2>
                                        <p className="text-sm text-slate-400 mt-1">Define the tone and personality of your content.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleGenerateEcosystem}
                                            disabled={isGeneratingAll}
                                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-md active:scale-95 text-sm h-[38px] min-w-max"
                                            title={localStorage.getItem('vult_language') === 'en' ? 'Generate ecosystem from report' : 'Generar ecosistema del reporte'}
                                        >
                                            {isGeneratingAll ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                            {isGeneratingAll
                                                ? (localStorage.getItem('vult_language') === 'en' ? 'Generating ecosystem...' : 'Generando ecosistema...')
                                                : (localStorage.getItem('vult_language') === 'en' ? '✨ Auto-Generate Voice' : '✨ Autogenerar Voz')}
                                        </button>
                                        <button onClick={openCreateVoice} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-0 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 h-[38px]">
                                            <Plus className="size-4" /> Add Brand Voice
                                        </button>
                                    </div>
                                </div>

                                {isLoadingVoices ? (
                                    <div className="flex flex-col items-center justify-center py-20">
                                        <Loader2 className="size-8 text-blue-500 animate-spin mb-4" />
                                        <p className="text-slate-400">Loading brand voices...</p>
                                    </div>
                                ) : voices.length === 0 ? (
                                    <div className="bg-surface-dark border border-white/5 rounded-2xl p-12 text-center">
                                        <div className="size-16 w-full flex items-center justify-center mb-4">
                                            <div className="size-16 bg-blue-500/10 rounded-full flex items-center justify-center">
                                                <Mic className="size-8 text-blue-400" />
                                            </div>
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2">No brand voices yet</h3>
                                        <p className="text-slate-400 max-w-md mx-auto mb-6">Create a brand voice to guide the tone of your AI generated content and ensure consistency across all channels.</p>
                                        <button onClick={openCreateVoice} className="bg-white text-slate-900 border border-white/10 px-6 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors mx-auto inline-flex items-center gap-2">
                                            <Plus className="size-4" /> Create First Voice
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {voices.map((v) => (
                                            <div key={v.id} onClick={() => setActiveVoiceId(v.id)} className={cn("group relative bg-surface-dark border rounded-2xl p-6 transition-all shadow-xl cursor-pointer", activeVoiceId === v.id ? 'border-emerald-500/50 shadow-emerald-500/10' : 'border-white/10 hover:border-blue-500/30 hover:shadow-black/20')}>
                                                <div className="absolute top-4 right-4 flex gap-2">
                                                    {activeVoiceId === v.id && <div className="size-2 rounded-full bg-emerald-500 mt-2 mr-2 animate-pulse" />}
                                                    <button onClick={(e) => { e.stopPropagation(); openEditVoice(v); }} className="p-2 opacity-0 group-hover:opacity-100 bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-all">
                                                        <Edit className="size-4" />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'voice', id: v.id, name: v.name }); }} className="p-2 opacity-0 group-hover:opacity-100 bg-slate-800 text-slate-300 hover:text-red-400 rounded-lg transition-all">
                                                        <Trash2 className="size-4" />
                                                    </button>
                                                </div>
                                                <div className="mb-4">
                                                    <div className="size-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                                                        <Mic className="size-6 text-blue-400" />
                                                    </div>
                                                    <h3 className="text-lg font-bold text-white mb-1 group-hover:text-blue-300 transition-colors">{v.name}</h3>
                                                    <span className="inline-block px-2.5 py-1 bg-white/5 text-slate-300 text-xs rounded-full border border-white/10">{v.archetype}</span>
                                                </div>
                                                <p className="text-sm text-slate-400 line-clamp-3 mb-4">{v.valueProposition}</p>

                                                <div className="space-y-4 pt-4 border-t border-white/5">
                                                    <div>
                                                        <div className="flex justify-between text-sm mb-1.5">
                                                            <span className="text-slate-500">Formality</span>
                                                            <span className="text-blue-400 font-medium">{v.formalityCasual}%</span>
                                                        </div>
                                                        <div className="h-1.5 bg-background-dark rounded-full overflow-hidden">
                                                            <div className="h-full bg-blue-500" style={{ width: `${v.formalityCasual}%` }} />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-sm mb-1.5">
                                                            <span className="text-slate-500">Authority</span>
                                                            <span className="text-purple-400 font-medium">{v.authoritativeEmpathetic}%</span>
                                                        </div>
                                                        <div className="h-1.5 bg-background-dark rounded-full overflow-hidden">
                                                            <div className="h-full bg-purple-500" style={{ width: `${v.authoritativeEmpathetic}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {/* ── CONTEXT LIBRARY ──────────────────────────────────────────────── */}
                        {activeTab === 'context' && (
                            <div className="p-8 max-w-5xl mx-auto space-y-8">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            <Library className="size-5 text-blue-400" /> Context Library
                                        </h2>
                                        <p className="text-sm text-slate-500 mt-1">
                                            Upload documents, manuals, or research. The AI reads these files to understand your specific business context.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium cursor-pointer transition-colors">
                                            <Upload className="size-4" />
                                            <span>Upload .txt / .md</span>
                                            <input type="file" multiple accept=".txt,.md,.csv,.json" onChange={handleFileUpload} className="hidden" />
                                        </label>
                                    </div>
                                </div>

                                {isLoadingContext ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />)}
                                    </div>
                                ) : contextFiles.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-3xl text-slate-600 gap-4">
                                        <FileText className="size-12 opacity-20" />
                                        <div className="text-center">
                                            <p className="text-base font-medium text-slate-500">Your context library is empty</p>
                                            <p className="text-sm mt-1 max-w-xs mx-auto">Upload your product guides, sales scripts, or industry reports to make the AI smarter.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {contextFiles.map((file) => (
                                            <motion.div
                                                key={file.id}
                                                initial={{ opacity: 0, scale: 0.98 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="bg-surface-dark border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:border-blue-500/20 transition-all"
                                            >
                                                <div className="flex items-center gap-4 overflow-hidden">
                                                    <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                                                        <FileText className="size-5" />
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <h3 className="text-sm font-medium text-white truncate">{file.name}</h3>
                                                        <p className="text-[11px] text-slate-500 mt-1">
                                                            Added {new Date(file.createdAt).toLocaleDateString()} · {Math.round(file.content.length / 1024)} KB
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => {
                                                            const blob = new Blob([file.content], { type: 'text/plain' });
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement('a');
                                                            a.href = url;
                                                            a.download = file.name;
                                                            a.click();
                                                        }}
                                                        className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors"
                                                        title="Download"
                                                    >
                                                        <ExternalLink className="size-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteFile(file.id)}
                                                        className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}

                                {isUploading && (
                                    <div className="fixed bottom-8 right-8 bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] animate-bounce">
                                        <Sparkles className="size-5 animate-spin" />
                                        <span className="font-medium">Uploading to context library...</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── PILLAR MODAL ─────────────────────────────────────────────────── */}
            <AnimatePresence>
                {isPillarModalOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50" onClick={() => setIsPillarModalOpen(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                            <div className="bg-[#111318] border border-white/10 rounded-2xl shadow-2xl w-[520px] pointer-events-auto overflow-hidden">
                                <div className="flex items-center justify-between p-5 border-b border-white/8">
                                    <h3 className="font-bold text-white flex items-center gap-2"><Target className="size-4 text-blue-400" /> {editingPillar ? 'Edit Pillar' : 'New Content Pillar'}</h3>
                                    <button onClick={() => setIsPillarModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"><X className="size-4" /></button>
                                </div>
                                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-1.5">Pillar Name *</label>
                                        <input type="text" value={pillarForm.name} onChange={e => setPillarForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Thought Leadership, Product Education" className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-1.5">Core Theme</label>
                                        <textarea value={pillarForm.coreTheme} onChange={e => setPillarForm(f => ({ ...f, coreTheme: e.target.value }))} placeholder="What is this pillar fundamentally about? Define its scope." rows={2} className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-1.5">Keywords</label>
                                        <div className="flex gap-2 mb-2">
                                            <input type="text" value={pillarKeywordInput} onChange={e => setPillarKeywordInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()} placeholder="Add a keyword and press Enter" className="flex-1 bg-background-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
                                            <button onClick={addKeyword} className="px-4 py-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-xl text-sm hover:bg-blue-600/30 transition-colors">Add</button>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {pillarForm.keywords.map((kw, i) => (
                                                <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs rounded-full">
                                                    {kw}<button onClick={() => setPillarForm(f => ({ ...f, keywords: f.keywords.filter((_, j) => j !== i) }))}><X className="size-2.5 ml-0.5 hover:text-red-400" /></button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-1.5">AI Directive</label>
                                        <textarea value={pillarForm.aiDirective} onChange={e => setPillarForm(f => ({ ...f, aiDirective: e.target.value }))} placeholder='Instruction for the AI when writing under this pillar. e.g. "Always lead with a data point. Use a professional but accessible tone."' rows={2} className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-1.5">Visual Style Notes</label>
                                        <input type="text" value={pillarForm.visualStyle} onChange={e => setPillarForm(f => ({ ...f, visualStyle: e.target.value }))} placeholder="e.g. Dark backgrounds, data visualizations, minimal text" className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/8">
                                    <button onClick={() => setIsPillarModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">Cancel</button>
                                    <button onClick={handleSavePillar} disabled={!pillarForm.name.trim() || isSavingPillar} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors">
                                        {isSavingPillar ? <Sparkles className="size-3.5 animate-spin" /> : <Target className="size-3.5" />}
                                        {editingPillar ? 'Save Changes' : 'Create Pillar'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── PERSONA MODAL ─────────────────────────────────────────────────── */}
            <AnimatePresence>
                {isPersonaModalOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50" onClick={() => setIsPersonaModalOpen(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none py-8">
                            <div className="bg-[#111318] border border-white/10 rounded-2xl shadow-2xl w-[560px] pointer-events-auto overflow-hidden max-h-full flex flex-col">
                                <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                                    <h3 className="font-bold text-white flex items-center gap-2"><Users className="size-4 text-purple-400" /> {editingPersona ? 'Edit Persona' : 'New Buyer Persona'}</h3>
                                    <button onClick={() => setIsPersonaModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"><X className="size-4" /></button>
                                </div>
                                <div className="overflow-y-auto custom-scrollbar">
                                    <div className="p-5 space-y-5">
                                        {/* Identity */}
                                        <div>
                                            <p className="text-[11px] font-bold text-slate-400 md:text-xs">
                                                {localStorage.getItem('vult_language') === 'en' ? 'Who is this persona? You will add details like goals and objections in Persona Studio later.' : '¿Quién es esta persona? Agregarás los detalles como metas y objeciones en el Persona Studio.'}
                                            </p>
                                            <div className="grid grid-cols-1 gap-4 mt-6">
                                                <div className="col-span-1">
                                                    <label className="text-sm text-slate-500 block mb-1.5 font-medium">
                                                        {localStorage.getItem('vult_language') === 'en' ? 'Full Name *' : 'Nombre Completo *'}
                                                    </label>
                                                    <input type="text" value={personaForm.name} onChange={e => setPersonaForm(f => ({ ...f, name: e.target.value }))} placeholder={localStorage.getItem('vult_language') === 'en' ? "e.g. Marketing Manager Maria" : "e.g. María, Gerente de Marketing"} className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 shadow-inner" />
                                                </div>
                                                <div className="col-span-1">
                                                    <label className="text-sm text-slate-500 block mb-1.5 font-medium">
                                                        {localStorage.getItem('vult_language') === 'en' ? 'Job Title / Role' : 'Puesto de Trabajo / Rol'}
                                                    </label>
                                                    <input type="text" value={personaForm.jobTitle} onChange={e => setPersonaForm(f => ({ ...f, jobTitle: e.target.value }))} placeholder={localStorage.getItem('vult_language') === 'en' ? 'e.g. Marketing Director' : 'e.g. Director de Marketing'} className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 shadow-inner" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/8 flex-shrink-0">
                                    <button onClick={() => setIsPersonaModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">{localStorage.getItem('vult_language') === 'en' ? 'Cancel' : 'Cancelar'}</button>
                                    <button onClick={handleSavePersona} disabled={!personaForm.name.trim() || isSavingPersona} className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors">
                                        {isSavingPersona ? <Sparkles className="size-3.5 animate-spin" /> : <Users className="size-3.5" />}
                                        {editingPersona ? (localStorage.getItem('vult_language') === 'en' ? 'Save Changes' : 'Guardar Cambios') : (localStorage.getItem('vult_language') === 'en' ? 'Create Persona' : 'Crear Persona')}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── VOICE MODAL ─────────────────────────────────────────────────── */}
            <AnimatePresence>
                {isVoiceModalOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50" onClick={() => setIsVoiceModalOpen(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none py-8">
                            <div className="bg-[#111318] border border-white/10 rounded-2xl shadow-2xl w-[600px] pointer-events-auto overflow-hidden max-h-full flex flex-col">
                                <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
                                    <h3 className="font-bold text-white flex items-center gap-2"><Mic className="size-4 text-blue-400" /> {editingVoice ? 'Edit Brand Voice' : 'New Brand Voice'}</h3>
                                    <button onClick={() => setIsVoiceModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"><X className="size-4" /></button>
                                </div>
                                <div className="overflow-y-auto custom-scrollbar p-5 space-y-6">

                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-1.5">Voice Name *</label>
                                        <input type="text" value={voiceForm.name} onChange={e => setVoiceForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Primary Brand Voice" className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-1.5">Brand Archetype</label>
                                        <div className="relative">
                                            <select
                                                value={voiceForm.archetype}
                                                onChange={e => setVoiceForm(f => ({ ...f, archetype: e.target.value as Archetype }))}
                                                className="w-full bg-background-dark border border-white/10 rounded-xl pl-4 pr-10 py-3 text-sm text-white appearance-none focus:outline-none focus:border-blue-500/50"
                                            >
                                                {JUNGIAN_ARCHETYPES.map(a => <option key={a} value={a}>{a}</option>)}
                                            </select>
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-1.5">Value Proposition</label>
                                        <textarea value={voiceForm.valueProposition} onChange={e => setVoiceForm(f => ({ ...f, valueProposition: e.target.value }))} placeholder="What unique value do you provide to your audience?" rows={3} className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none" />
                                    </div>

                                    <div className="space-y-6 pt-2">
                                        <p className="text-sm font-semibold text-white">Tone Sliders</p>
                                        <ToneSlider label="Formality" leftLabel="Formal" rightLabel="Casual" value={voiceForm.formalityCasual} onChange={v => setVoiceForm(f => ({ ...f, formalityCasual: v }))} />
                                        <ToneSlider label="Authority" leftLabel="Empathetic" rightLabel="Authoritative" value={voiceForm.authoritativeEmpathetic} onChange={v => setVoiceForm(f => ({ ...f, authoritativeEmpathetic: v }))} />
                                        <ToneSlider label="Playfulness" leftLabel="Serious" rightLabel="Playful" value={voiceForm.seriousPlayful} onChange={v => setVoiceForm(f => ({ ...f, seriousPlayful: v }))} />
                                    </div>

                                </div>
                                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/8 flex-shrink-0">
                                    <button onClick={() => setIsVoiceModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">Cancel</button>
                                    <button onClick={handleSaveVoice} disabled={!voiceForm.name.trim() || isSavingVoice} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors">
                                        {isSavingVoice ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                                        {editingVoice ? 'Save Changes' : 'Create Voice'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── DELETE CONFIRM ──────────────────────────────────────────────── */}
            <AnimatePresence>
                {deleteConfirm && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-[60]" onClick={() => setDeleteConfirm(null)} />
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', damping: 25, stiffness: 350 }} className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
                            <div className="bg-[#111318] border border-red-500/20 rounded-2xl shadow-2xl w-[420px] pointer-events-auto p-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-red-500/10 rounded-xl flex-shrink-0">
                                        <AlertTriangle className="size-6 text-red-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-white mb-1">Delete "{deleteConfirm.name}"?</h3>
                                        <p className="text-sm text-slate-400 leading-relaxed">Removing this {deleteConfirm.type === 'pillar' ? 'content pillar' : deleteConfirm.type === 'persona' ? 'buyer persona' : 'brand voice'} will affect AI generation in the Content Generator and all other creation modules that reference it. This action cannot be undone.</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-end gap-3 mt-6">
                                    <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">Cancel</button>
                                    <button
                                        onClick={() => {
                                            if (deleteConfirm.type === 'pillar') handleDeletePillar(deleteConfirm.id);
                                            else if (deleteConfirm.type === 'persona') handleDeletePersona(deleteConfirm.id);
                                            else if (deleteConfirm.type === 'voice') handleDeleteVoice(deleteConfirm.id);
                                        }}
                                        className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
                                    >
                                        <Trash2 className="size-3.5" /> Yes, Delete
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div >
    );
}
