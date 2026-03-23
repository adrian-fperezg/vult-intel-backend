import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { useNavigate } from 'react-router-dom';
import {
    Search, Target, LayoutTemplate, ArrowDownToLine, Plus,
    Globe, Bookmark, List, Copy, Play, LayoutGrid, CheckCircle2,
    BarChart3, Settings2, FileText, Download, X, Layers, ArrowRight, Upload,
    AlertCircle, Clock, ChevronRight, Activity, Percent, MessageSquare,
    Check, ChevronDown, FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getProjects, Project } from '@/services/scanService';
import { logGrowthPlanRun, logContentGenerated } from '@/services/analytics';
import { generateKeywordResearch, KeywordResearchData, generateSeoAudit, SeoAuditData, generateLandingBlueprint, BlueprintData, validateQuota } from '@/services/ai';
import { saveKeywordResearch, getKeywordResearches, deleteKeywordResearch, SavedKeywordResearch } from '@/services/keywordResearchService';
import { getSeoAudits, deleteSeoAudit, saveSeoAudit, SavedSeoAudit } from '@/services/seoAuditService';
import { getLandingBlueprints, deleteLandingBlueprint, saveLandingBlueprint, SavedLandingBlueprint } from '@/services/landingBuilderService';
import { saveBlueprintWorkbenchItem, getBlueprintWorkbenchItems, deleteBlueprintWorkbenchItem, SavedWorkbenchItem } from '@/services/blueprintWorkbenchService';
import { exportToDoc, exportToCsv, convertMarkdownToHtml } from '@/lib/exportUtils';
import { exportToDocx } from '@/utils/docxExport';
import { useProject, ActiveProjectData } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserMetrics } from '@/hooks/useUserMetrics';
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';
import { toast } from 'react-hot-toast';

type TabType = 'research' | 'audit' | 'builder';

export default function WebGrowthPlan() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { activeProjectId, activeProject, isLoading } = useProject();
    const [activeTab, setActiveTab] = useState<TabType>('research');
    const [isAdvancedMode, setIsAdvancedMode] = useState(false);
    const [builderInitialKeyword, setBuilderInitialKeyword] = useState('');
    const [loadedResearch, setLoadedResearch] = useState<SavedKeywordResearch | null>(null);
    const [loadedAudit, setLoadedAudit] = useState<SavedSeoAudit | null>(null);
    const [loadedBlueprint, setLoadedBlueprint] = useState<SavedLandingBlueprint | null>(null);

    // Workbench state
    const [savedItems, setSavedItems] = useState<{ id: string, type: string, title: string, data?: any, createdAt?: number, isWorkbench?: boolean }[]>([]);
    const [itemToDelete, setItemToDelete] = useState<{ id: string, type: string, isWorkbench?: boolean } | null>(null);

    useEffect(() => {
        const load = async () => {
            if (activeProjectId) {
                const [researches, audits, blueprints, workbenchItems] = await Promise.all([
                    getKeywordResearches(activeProjectId),
                    getSeoAudits(activeProjectId),
                    getLandingBlueprints(activeProjectId),
                    getBlueprintWorkbenchItems(activeProjectId)
                ]);
                const items = [
                    ...researches.map(r => ({ id: r.id, type: 'Keyword Scan', title: r.seedKeyword, data: r, createdAt: r.createdAt })),
                    ...audits.map(a => ({ id: a.id, type: 'SEO Audit', title: a.canonicalUrl, data: a, createdAt: a.createdAt })),
                    ...blueprints.map(b => ({ id: b.id, type: 'Landing Blueprint', title: `${b.objective} ${b.contentType}`, data: b, createdAt: b.createdAt })),
                    ...workbenchItems.map(w => ({ id: w.id, type: w.type, title: w.title, data: w.data, createdAt: w.createdAt, isWorkbench: true }))
                ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                setSavedItems(items);
            }
        };
        load();
    }, [activeProjectId]);

    const handleSaveWorkbenchItem = async (item: { itemId: string, type: string, title: string, data?: any }) => {
        if (!activeProjectId) return;
        try {
            const newItem = await saveBlueprintWorkbenchItem(activeProjectId, item.itemId, item.type, item.title, item.data);
            setSavedItems(prev => [
                { id: newItem.id, type: newItem.type, title: newItem.title, data: newItem.data, createdAt: newItem.createdAt, isWorkbench: true },
                ...prev
            ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
            toast.success('Guardado en el Workbench');
        } catch (error) {
            console.error('Failed to save to workbench', error);
            toast.error('Error al guardar en el Workbench');
        }
    };

    const confirmDeleteWorkbenchItem = async () => {
        if (!itemToDelete || !activeProjectId) return;
        try {
            if (itemToDelete.isWorkbench) {
                await deleteBlueprintWorkbenchItem(itemToDelete.id);
            } else {
                if (itemToDelete.type === 'Keyword Scan') await deleteKeywordResearch(activeProjectId, itemToDelete.id);
                if (itemToDelete.type === 'SEO Audit') await deleteSeoAudit(activeProjectId, itemToDelete.id);
                if (itemToDelete.type === 'Landing Blueprint') await deleteLandingBlueprint(activeProjectId, itemToDelete.id);
            }
            setSavedItems(prev => prev.filter(item => item.id !== itemToDelete.id));
            toast.success('Elemento eliminado del Workbench');
        } catch (error) {
            console.error('Failed to delete item from workbench', error);
            toast.error('Error al eliminar elemento');
        } finally {
            setItemToDelete(null);
        }
    };

    const tabs = [
        { id: 'research', label: 'Keyword & Competitor', icon: Search },
        { id: 'audit', label: 'SEO Audit & Plan', icon: BarChart3 },
        { id: 'builder', label: 'Offer & Landing Builder', icon: LayoutTemplate },
    ] as const;

    return (
        <div className="flex flex-col lg:flex-row h-full bg-background-dark overflow-y-auto lg:overflow-hidden text-slate-800 dark:text-slate-200 font-sans">
            {/* Main Content Area (Left) */}
            <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden relative">

                {/* Shared Header */}
                <header className="px-8 py-6 border-b border-white/5 bg-background-dark shrink-0 z-10 backdrop-blur-xl">
                    <div className="max-w-[1400px] mx-auto flex items-center justify-between">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                                    <Globe className="size-5 text-blue-400" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                        {isLoading ? 'Syncing...' : (activeProject?.project?.name || 'Select Project')}
                                    </h1>
                                    <p className="text-sm text-slate-400 font-medium">
                                        {activeProject?.project?.niche || 'Niche not set'} • {activeProject?.project?.url || 'URL not set'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-full">
                                <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Data Fresh</span>
                            </div>

                            <button
                                onClick={() => setIsAdvancedMode(!isAdvancedMode)}
                                className={cn(
                                    "px-4 py-2 text-sm font-semibold rounded-lg transition-all border",
                                    isAdvancedMode
                                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                        : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                                )}
                            >
                                {isAdvancedMode ? 'Advanced Mode' : 'Simple Mode'}
                            </button>

                            <div className="h-6 w-px bg-white/10 mx-2" />


                            <button className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-slate-200 font-semibold text-sm rounded-lg transition-all shadow-lg">
                                <Plus className="size-4" /> Add to Campaign
                            </button>
                        </div>
                    </div>
                </header>

                {/* Tab Navigation */}
                <div className="px-8 pt-6 pb-2 shrink-0 border-b border-white/5 bg-background-dark/50 z-10">
                    <div className="max-w-[1400px] mx-auto flex items-center gap-2">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabType)}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-all relative overflow-hidden",
                                        isActive
                                            ? "text-white bg-white/10 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                                    )}
                                >
                                    <Icon className={cn("size-4", isActive ? "text-blue-400" : "text-slate-500")} />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Main Scrollable Content */}
                <main className="flex-1 overflow-y-auto px-8 py-8 relative">
                    <div className="max-w-[1400px] mx-auto">
                        <AnimatePresence mode="wait">
                            {activeTab === 'research' && (
                                <motion.div key="research" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                                    <ResearchTabContent
                                        projectId={activeProjectId || undefined}
                                        projectContext={activeProject || undefined}
                                        loadedResearch={loadedResearch}
                                        onSaveItem={handleSaveWorkbenchItem}
                                        onResearchSaved={(research) => {
                                            setSavedItems(prev => {
                                                const newItem = { id: research.id, type: 'Keyword Scan', title: research.seedKeyword, data: research };
                                                return [newItem, ...prev];
                                            });
                                        }}
                                        onNavigateToBuilder={(kw) => {
                                            setBuilderInitialKeyword(kw);
                                            setActiveTab('builder');
                                        }}
                                        onNavigateToContentGenerator={(kw) => {
                                            navigate('/content-generator', { state: { initialPrompt: kw } });
                                        }}
                                    />
                                </motion.div>
                            )}
                            {activeTab === 'audit' && (
                                <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                                    <AuditTabContent
                                        projectId={activeProjectId || undefined}
                                        projectContext={activeProject || undefined}
                                        loadedAudit={loadedAudit}
                                    />
                                </motion.div>
                            )}
                            {activeTab === 'builder' && (
                                <motion.div key="builder" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                                    <BuilderTabContent
                                        projectId={activeProjectId || undefined}
                                        projectContext={activeProject || undefined}
                                        loadedBlueprint={loadedBlueprint}
                                        onSaveItem={handleSaveWorkbenchItem}
                                        initialKeyword={builderInitialKeyword}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </main>
            </div>

            {/* Right Workbench Panel */}
            <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-surface-border bg-surface-dark flex flex-col z-20 lg:shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
                <div className="p-6 border-b border-surface-border flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <Layers className="size-4 text-blue-500" /> Workbench
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-sm font-bold text-blue-500">
                        {savedItems.length}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {savedItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-xl">
                            <Bookmark className="size-8 text-slate-600 mb-3" />
                            <p className="text-sm text-slate-400 font-medium">Your dock is empty.</p>
                            <p className="text-sm text-slate-500 mt-2">Save keywords, competitor insights, and copy blocks here while you research.</p>
                        </div>
                    ) : (
                        savedItems.map((item, idx) => (
                            <div key={idx} className="p-4 bg-surface-light border border-surface-border hover:border-blue-500/50 rounded-xl group transition-all text-sm shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs uppercase font-bold tracking-wider text-blue-400">{item.type}</span>
                                    <button onClick={() => setItemToDelete({ id: item.id, type: item.type, isWorkbench: item.isWorkbench })} className="opacity-0 group-hover:opacity-100 text-sm text-slate-500 hover:text-red-400 transition-opacity">
                                        <X className="size-3" />
                                    </button>
                                </div>
                                <p onClick={() => {
                                    if (item.data) {
                                        if (item.type === 'Keyword Scan') { setLoadedResearch(item.data); setActiveTab('research'); }
                                        if (item.type === 'SEO Audit') { setLoadedAudit(item.data); setActiveTab('audit'); }
                                        if (item.type === 'Landing Blueprint') { setLoadedBlueprint(item.data); setActiveTab('builder'); }
                                    }
                                }} className="font-medium text-slate-300 cursor-pointer hover:text-blue-400">{item.title}</p>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-surface-border bg-surface-light">
                    <button
                        onClick={() => {
                            // Dummy stub for "export bundle" if needed
                        }}
                        className="w-full py-2.5 bg-surface-mid hover:bg-white/10 text-white text-sm font-bold uppercase tracking-widest rounded-lg transition-colors border border-surface-border"
                    >
                        Export to Sheets
                    </button>
                </div>

                {/* Delete Confirm Modal */}
                <AnimatePresence>
                    {itemToDelete && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-surface-dark border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-rose-600" />
                                <div className="flex flex-col items-center justify-center text-center space-y-4 mb-6">
                                    <div className="size-12 rounded-full bg-red-500/10 flex items-center justify-center">
                                        <X className="size-6 text-red-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-1">Delete Item</h3>
                                        <p className="text-sm text-slate-400">Are you sure you want to remove this item from your workbench? This cannot be undone.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setItemToDelete(null)}
                                        className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-medium hover:bg-white/5 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDeleteWorkbenchItem}
                                        className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20 transition-colors text-sm border border-red-500/20"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </aside>
        </div>
    );
}

// ----------------------------------------------------------------------
// Sub-components for Tabs
// ----------------------------------------------------------------------

const COUNTRIES = [
    "Worldwide",
    "United States", "United Kingdom", "Canada", "Australia", "India", "Germany", "France", "Italy", "Spain", "Mexico",
    "Brazil", "Argentina", "Colombia", "Chile", "Peru", "South Africa", "Nigeria", "Kenya", "Japan", "South Korea",
    "China", "Singapore", "Malaysia", "Indonesia", "Philippines", "Vietnam", "Thailand", "Pakistan", "Bangladesh",
    "Egypt", "Saudi Arabia", "United Arab Emirates", "Turkey", "Israel", "Russia", "Ukraine", "Poland", "Netherlands",
    "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Switzerland", "Austria", "Ireland", "New Zealand"
].sort((a, b) => a === "Worldwide" ? -1 : b === "Worldwide" ? 1 : a.localeCompare(b));

function CountrySelect({ value, onChange }: { value: string, onChange: (v: string) => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="relative border-l border-white/10 pl-2" ref={ref}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-transparent text-sm text-slate-400 outline-none hover:text-white transition-colors px-2 py-1 select-none"
            >
                <span className="truncate max-w-[120px]">{value}</span>
                <ChevronDown className="size-3" />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-56 bg-surface-dark border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                        <div className="p-2 border-b border-white/10">
                            <div className="flex items-center px-2 bg-black/40 rounded-lg">
                                <Search className="size-3.5 text-slate-500 shrink-0" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search country..."
                                    className="w-full bg-transparent border-none text-sm text-white p-2 outline-none placeholder:text-slate-600"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                            {filtered.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center p-3">No results found.</p>
                            ) : (
                                filtered.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => {
                                            onChange(c);
                                            setIsOpen(false);
                                            setSearch('');
                                        }}
                                        className={cn(
                                            "w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-between",
                                            value === c ? "bg-blue-500/10 text-blue-400 font-bold" : "text-slate-300 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        <span>{c}</span>
                                        {value === c && <Check className="size-3 shrink-0" />}
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ResearchTabContent({
    projectId,
    projectContext,
    loadedResearch,
    onSaveItem,
    onResearchSaved,
    onNavigateToBuilder,
    onNavigateToContentGenerator
}: {
    projectId?: string,
    projectContext?: ActiveProjectData,
    loadedResearch?: SavedKeywordResearch | null,
    onSaveItem: (item: { itemId: string, type: string, title: string, data?: any }) => void,
    onResearchSaved: (research: SavedKeywordResearch) => void,
    onNavigateToBuilder: (kw: string) => void,
    onNavigateToContentGenerator: (kw: string) => void
}) {
    const { currentUser } = useAuth();
    const { totalLimits, metrics } = useUserMetrics();
    const [seed, setSeed] = useState('');
    const [intent, setIntent] = useState('All Intents');
    const [country, setCountry] = useState('United States');
    const [isScanning, setIsScanning] = useState(false);
    const [data, setData] = useState<KeywordResearchData | null>(null);

    useEffect(() => {
        if (loadedResearch) {
            setSeed(loadedResearch.seedKeyword);
            setIntent(loadedResearch.intent);
            setCountry(loadedResearch.country);
            setData(loadedResearch.data);
        }
    }, [loadedResearch]);

    const handleScan = async () => {
        if (!seed) return;
        setIsScanning(true);
        logGrowthPlanRun(seed, 'General');
        const totalTokensUsed = metrics.tokensUsed || 0;
        const tokensRemaining = (totalLimits.tokens || 50000) - totalTokensUsed;

        try {
            validateQuota(tokensRemaining, currentUser?.email);
            const result = await generateKeywordResearch(seed, intent, country, currentUser?.uid, projectContext || undefined);
            setData(result);
            if (projectId) {
                const saved = await saveKeywordResearch(projectId, seed, intent, country, result);
                onResearchSaved(saved);
            }
        } catch (error) {
            console.error(error);
            // Handle error state if needed
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight leading-tight">Keyword & Competitor Discovery</h2>
                    <p className="text-slate-400 text-sm mt-1">Discover SERP competitors, find keyword gaps, and map content opportunities.</p>
                </div>
            </div>

            {/* Search Input Bar */}
            <div className="p-2 bg-surface-dark border border-white/10 rounded-xl flex items-center shadow-xl focus-within:border-blue-500/50 transition-colors">
                <div className="flex-1 flex items-center px-4">
                    <Search className="size-5 text-slate-500 mr-3" />
                    <input
                        type="text"
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                        placeholder="Enter seed keyword (e.g. 'SaaS marketing tools')..."
                        className="w-full bg-transparent border-none outline-none text-white text-sm placeholder:text-slate-600"
                        onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                    />
                </div>

                {/* Filters */}
                <div className="hidden md:flex items-center gap-2 border-l border-white/10 pl-4 mr-2 relative">
                    <select value={intent} onChange={e => setIntent(e.target.value)} className="bg-transparent text-sm text-slate-400 outline-none cursor-pointer hover:text-white transition-colors">
                        <option>All Intents</option>
                        <option>Informational</option>
                        <option>Commercial</option>
                        <option>Transactional</option>
                    </select>
                    <CountrySelect value={country} onChange={setCountry} />
                </div>

                <div className="h-6 w-px bg-white/10 mx-2" />

                <button
                    onClick={handleScan}
                    disabled={isScanning || !seed.trim()}
                    className="flex justify-center min-w-[120px] items-center gap-2 px-6 py-2.5 bg-white text-black hover:bg-slate-200 font-semibold rounded-lg transition-all shrink-0 disabled:opacity-50"
                >
                    {isScanning ? (
                        <div className="size-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    ) : (
                        <>Deep Scan <ArrowRight className="size-4" /></>
                    )}
                </button>
            </div>

            {!data ? (
                /* Empty State */
                <div className="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-2xl bg-white/[0.02]">
                    <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20">
                        <Target className="size-8 text-blue-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">No research data yet</h3>
                    <p className="text-slate-400 max-w-sm text-sm">Enter a seed keyword above to automatically discover top SERP competitors and keyword opportunities tailored to this project.</p>
                </div>
            ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">

                    {/* SERP Competitor Discovery */}
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Globe className="size-4 text-blue-500" /> SERP Competitor Discovery
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {data.competitors.map((c, i) => (
                                <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 transition-all flex flex-col group relative overflow-hidden">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-semibold text-slate-400 px-2.5 py-1 bg-white/5 rounded-md">{c.type}</span>
                                    </div>
                                    <p className="text-lg font-bold text-white truncate" title={c.domain}>{c.domain}</p>
                                    <div className="mt-3 flex items-center gap-2 text-sm">
                                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${c.relevance}%` }}></div>
                                        </div>
                                        <span className="text-emerald-400 font-bold">{c.relevance}%</span>
                                    </div>
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Relevance Match</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Keyword Opportunity Table */}
                    <div className="border border-white/10 bg-surface-dark rounded-2xl overflow-hidden shadow-2xl">
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                <List className="size-4 text-purple-500" /> Keyword Opportunities
                            </h3>
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-bold text-slate-400">{data.keywords.length} Results</span>
                                <button
                                    onClick={async () => {
                                        const rows = [['Keyword', 'Intent', 'Volume', 'Difficulty', 'SERP Features', 'Action', 'Route']];
                                        data.keywords.forEach((kw: any) => {
                                            rows.push([kw.kw, kw.intent, kw.vol, kw.diff, kw.features.join(', '), kw.action, kw.route]);
                                        });
                                        try {
                                            await exportToCsv(rows, 'Keyword_Opportunities');
                                        } catch (e) {
                                            alert("Error: Please link your Google Account and ensure Drive API is enabled.");
                                        }
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg transition-colors border border-white/10"
                                >
                                    <FileSpreadsheet className="size-3" /> Export to Sheets
                                </button>
                            </div>
                        </div>
                        <div className="w-full overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="text-sm uppercase tracking-wider text-slate-500 bg-black/40">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Keyword</th>
                                        <th className="px-6 py-4 font-semibold">Intent</th>
                                        <th className="px-6 py-4 font-semibold">Volume</th>
                                        <th className="px-6 py-4 font-semibold">Difficulty</th>
                                        <th className="px-6 py-4 font-semibold">SERP Features</th>
                                        <th className="px-6 py-4 font-semibold">Action</th>
                                        <th className="px-6 py-4 font-semibold text-right">Route</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.keywords.map((kw, i) => (
                                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4 font-bold text-white">{kw.kw}</td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md",
                                                    kw.intent.startsWith('Info') ? "bg-blue-500/10 text-blue-400" :
                                                        kw.intent.startsWith('Comm') ? "bg-purple-500/10 text-purple-400" :
                                                            "bg-emerald-500/10 text-emerald-400"
                                                )}>
                                                    {kw.intent}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-300">{kw.vol}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "font-bold",
                                                        kw.diff > 70 ? "text-red-400" : kw.diff > 50 ? "text-amber-400" : "text-emerald-400"
                                                    )}>{kw.diff}</span>/100
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-400 text-xs truncate max-w-[150px]">
                                                {kw.features.join(', ')}
                                            </td>
                                            <td className="px-6 py-4 text-slate-400 font-medium truncate max-w-[120px]">
                                                {kw.action}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => onNavigateToBuilder(kw.kw)} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-[10px] uppercase font-bold rounded transition-colors" title="Send to Builder">
                                                        Builder
                                                    </button>
                                                    <button onClick={() => onNavigateToContentGenerator(kw.kw)} className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 text-[10px] uppercase font-bold rounded transition-colors" title="Send to Content Generator">
                                                        Content
                                                    </button>
                                                    <button onClick={() => onSaveItem({ itemId: kw.kw, type: 'keyword', title: kw.kw, data: kw })} className="text-slate-500 hover:text-white transition-colors ml-2" title="Save to Workbench">
                                                        <Bookmark className="size-4 inline-block" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* People Also Ask / Questions */}
                    <div className="border border-white/10 bg-surface-dark rounded-2xl overflow-hidden shadow-2xl mt-8">
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                <MessageSquare className="size-4 text-rose-500" /> Top Searched Questions
                            </h3>
                        </div>
                        <div className="p-6">
                            <ul className="space-y-3">
                                {data.questions.map((q, idx) => (
                                    <li key={idx} className="flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 group">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="size-6 shrink-0 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 font-bold text-sm mt-0.5">
                                                {idx + 1}
                                            </div>
                                            <p className="text-white font-medium">{q}</p>
                                        </div>
                                        <div className="flex items-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity pl-10 md:pl-0 mt-2 md:mt-0">
                                            <span className="text-sm text-slate-500 mr-2">Create content:</span>
                                            <button onClick={() => onNavigateToContentGenerator(q)} className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 text-[10px] uppercase font-bold rounded transition-colors shrink-0">
                                                Social Media
                                            </button>
                                            <button onClick={() => onNavigateToBuilder(q)} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[10px] uppercase font-bold rounded transition-colors shrink-0">
                                                Landing Page
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                </motion.div>
            )}
        </div>
    );
}

function AuditTabContent({ projectId, projectContext, loadedAudit, onSaveItem }: { projectId?: string, projectContext?: ActiveProjectData, loadedAudit?: SavedSeoAudit | null, onSaveItem?: (item: { itemId: string, type: string, title: string, data?: any }) => void }) {
    const { currentUser } = useAuth();
    const { totalLimits, metrics } = useUserMetrics();
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditData, setAuditData] = useState<any>(null); // Type imported locally to avoid circular dep issues in this script for now, but will fix later

    useEffect(() => {
        if (loadedAudit) {
            setCanonicalUrl(loadedAudit.canonicalUrl);
            setCompetitors(loadedAudit.competitors);
            setFocusPages(loadedAudit.focusPages);
            setGoal(loadedAudit.goal);
            setAuditData(loadedAudit.data);
        }
    }, [loadedAudit]);

    // Inputs
    const [canonicalUrl, setCanonicalUrl] = useState('');
    const [competitorUrl, setCompetitorUrl] = useState('');
    const [competitors, setCompetitors] = useState<string[]>([]);
    const [focusPages, setFocusPages] = useState('Home, Pricing, Core Features');
    const [goal, setGoal] = useState('Traffic growth and health');

    const handleAddCompetitor = () => {
        if (competitorUrl && !competitors.includes(competitorUrl)) {
            setCompetitors([...competitors, competitorUrl]);
            setCompetitorUrl('');
        }
    };

    const handleRemoveCompetitor = (domain: string) => {
        setCompetitors(competitors.filter(c => c !== domain));
    };

    const handleAudit = async () => {
        if (!canonicalUrl) return;
        setIsAuditing(true);
        logGrowthPlanRun('SEO Audit', 'Website Audit');
        const totalTokensUsed = metrics.tokensUsed || 0;
        const tokensRemaining = (totalLimits.tokens || 50000) - totalTokensUsed;

        try {
            validateQuota(tokensRemaining, currentUser?.email);
            const result = await generateSeoAudit(canonicalUrl, competitors, focusPages, goal, currentUser?.uid, projectContext || undefined);
            setAuditData(result);
            if (projectId) {
                await saveSeoAudit(projectId, canonicalUrl, competitors, focusPages, goal, result);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsAuditing(false);
        }
    };

    const handleCalendarSync = () => {
        if (!auditData) return;
        let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Vult Intel//SEO Action Plan//EN\n";
        auditData.actionPlan.forEach((week: any, i: number) => {
            const start = new Date();
            start.setDate(start.getDate() + (i * 7) + 1);
            const end = new Date(start);
            end.setDate(end.getDate() + 7);
            const dtstart = start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            const dtend = end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            const summary = `SEO Plan Week ${week.week}: ${week.title}`;
            const description = week.tasks.map((t: any) => `- ${t.name}`).join('\\n');
            icsContent += "BEGIN:VEVENT\n";
            icsContent += `UID:${Date.now()}-${i}@vultintel\n`;
            icsContent += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n`;
            icsContent += `DTSTART:${dtstart}\n`;
            icsContent += `DTEND:${dtend}\n`;
            icsContent += `SUMMARY:${summary}\n`;
            icsContent += `DESCRIPTION:${description}\n`;
            icsContent += "END:VEVENT\n";
        });
        icsContent += "END:VCALENDAR";
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'seo_action_plan.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight leading-tight">SEO Audit & Action Plan</h2>
                    <p className="text-slate-400 text-sm mt-1">Audit Score & Prioritized Backlog</p>
                </div>
                {auditData && (
                    <button onClick={handleCalendarSync} className="flex items-center gap-2 px-4 py-2 bg-surface-light hover:bg-surface-mid text-blue-400 hover:text-blue-300 font-semibold rounded-xl transition-colors border border-blue-500/20 text-sm">
                        <Download className="size-4" /> Export to Calendar
                    </button>
                )}
            </div>

            <div className="p-5 bg-surface-dark border border-white/10 rounded-2xl flex flex-col gap-4 shadow-xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Canonical URL (Your Site)</label>
                        <input type="text" value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} placeholder="https://example.com" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Primary Goal</label>
                        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none">
                            <option>Traffic growth and health</option>
                            <option>Cluster ranking dominance</option>
                            <option>Conversion rate improvement</option>
                            <option>Local SEO & Domination</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Focus Pages</label>
                        <input type="text" value={focusPages} onChange={(e) => setFocusPages(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                        <p className="text-[10px] text-slate-500 mt-1">Ex: Home, Pricing, Major Landing Pages</p>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Competitors to Compare</label>
                        <div className="flex gap-2">
                            <input type="text" value={competitorUrl} onChange={(e) => setCompetitorUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddCompetitor()} placeholder="https://competitor.com" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                            <button onClick={handleAddCompetitor} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"><Plus className="size-4" /></button>
                        </div>
                        {competitors.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {competitors.map(c => (
                                    <span key={c} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 text-blue-300 text-[13px] rounded-lg border border-blue-500/30">
                                        {c}
                                        <button onClick={() => handleRemoveCompetitor(c)} className="hover:text-white"><X className="size-3" /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end border-t border-white/5 pt-4 mt-2">
                    <button onClick={handleAudit} disabled={isAuditing || !canonicalUrl} className="flex items-center justify-center min-w-[160px] px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-blue-500/20">
                        {isAuditing ? <><div className="size-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" /> Live Crawl...</> : auditData ? 'Re-Analyze' : 'Start Audit Run'}
                    </button>
                </div>
            </div>

            {auditData && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 p-8 bg-surface-dark rounded-2xl border border-white/10 flex flex-col md:flex-row items-center gap-10 shadow-xl overflow-hidden relative">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

                            <div className="relative size-48 shrink-0 flex items-center justify-center">
                                <svg className="size-full transform -rotate-90">
                                    <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
                                    <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={2 * Math.PI * 88} strokeDashoffset={2 * Math.PI * 88 * (1 - auditData.overallHealth.totalScore / 100)} className={auditData.overallHealth.totalScore >= 80 ? 'text-blue-500' : auditData.overallHealth.totalScore >= 60 ? 'text-amber-500' : 'text-red-500'} strokeLinecap="round" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                    <span className="text-5xl font-black text-white">{auditData.overallHealth.totalScore}</span>
                                    <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Total Score</span>
                                </div>
                            </div>

                            <div className="flex-1 space-y-6 z-10">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-2xl font-bold text-white">Overall Health</h3>
                                        {auditData.overallHealth.totalScore >= 80 ? (
                                            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider rounded-lg">Good Standing</span>
                                        ) : (
                                            <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-bold uppercase tracking-wider rounded-lg">Needs Work</span>
                                        )}
                                    </div>
                                    <p className="text-slate-400 text-sm leading-relaxed">{auditData.overallHealth.comparisonText}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between mb-3 text-sm font-bold text-slate-300">
                                            <span className="flex items-center gap-2"><Settings2 className="size-4 text-emerald-400" /> Technical</span>
                                            <span>{auditData.overallHealth.subscores.technical}<span className="text-slate-500 text-xs">/100</span></span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${auditData.overallHealth.subscores.technical}%` }} />
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between mb-3 text-sm font-bold text-slate-300">
                                            <span className="flex items-center gap-2"><FileText className="size-4 text-purple-400" /> Content</span>
                                            <span>{auditData.overallHealth.subscores.content}<span className="text-slate-500 text-sm">/100</span></span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-purple-400 rounded-full" style={{ width: `${auditData.overallHealth.subscores.content}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-1 border border-white/10 bg-surface-dark rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                            <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Activity className="size-4 text-slate-400" /> Quick Insights
                                </h3>
                            </div>
                            <div className="flex-1 p-5 space-y-4">
                                {auditData.quickInsights.map((insight: any, idx: number) => (
                                    <div key={idx} className="flex gap-3">
                                        <div className="mt-1 shrink-0">
                                            {insight.type === 'Critical Error' && <div className="size-2 rounded-sm bg-red-500" />}
                                            {insight.type === 'Warning' && <div className="size-2 rounded-sm bg-amber-500" />}
                                            {insight.type === 'Opportunity' && <div className="size-2 rounded-sm bg-blue-500" />}
                                        </div>
                                        <div>
                                            <p className="text-sm text-slate-300">
                                                <span className="font-bold text-white mr-1">{insight.type}:</span>
                                                {insight.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 border-t border-white/5 bg-white/[0.01]">
                                <button className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-semibold rounded-xl border border-white/10 transition-colors">
                                    View Full Report
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-6">
                        <div className="flex items-center gap-3">
                            <List className="size-5 text-blue-500" />
                            <div>
                                <h3 className="text-lg font-bold text-white">Prioritized Checklist</h3>
                                <p className="text-slate-400 text-sm mt-0.5">Issues ranked by potential impact on SERP performance.</p>
                            </div>
                        </div>
                        <div className="flex bg-black/40 border border-white/10 rounded-lg overflow-hidden p-1">
                            {['All', 'Critical', 'Warnings'].map(tab => (
                                <button key={tab} className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-colors w-24 text-center", tab === 'All' ? "bg-surface-mid text-white" : "text-slate-500 hover:text-slate-300")}>
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {auditData.prioritizedChecklist.map((item: any, idx: number) => {
                            let borderColor = 'border-l-blue-500';
                            let impactColor = 'bg-blue-500/20 text-blue-400';
                            let tagLabel = 'OPPORTUNITY';
                            if (item.impact === 'High' && item.effort !== 'High') {
                                borderColor = 'border-l-red-500';
                                impactColor = 'bg-red-500/20 text-red-400';
                                tagLabel = 'HIGH IMPACT';
                            } else if (item.impact === 'High' || item.impact === 'Medium') {
                                borderColor = 'border-l-amber-500';
                                impactColor = 'bg-amber-500/20 text-amber-500';
                                tagLabel = 'MED IMPACT';
                            } else {
                                borderColor = 'border-l-emerald-500';
                                impactColor = 'bg-emerald-500/20 text-emerald-400';
                                tagLabel = 'LOW IMPACT';
                            }

                            return (
                                <div key={idx} className={cn("bg-surface-dark border border-white/10 rounded-2xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden border-l-4", borderColor)}>
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full", impactColor)}>{tagLabel}</span>
                                                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-slate-400">{item.effort} Effort</span>
                                            </div>
                                            <button className="text-slate-500 hover:text-white"><Settings2 className="size-3" /></button>
                                        </div>
                                        <h4 className="text-base font-bold text-white leading-snug mb-2">{item.issue}</h4>
                                        <p className="text-sm text-slate-400 leading-relaxed mb-4">{item.whyItMatters}</p>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-auto">
                                        <div className="flex -space-x-2">
                                            <div className="size-6 rounded-full bg-slate-800 border-2 border-[#161616] flex items-center justify-center text-[8px] font-bold text-white">AI</div>
                                        </div>
                                        <button className="text-blue-400 hover:text-blue-300 text-sm font-bold tracking-wide flex items-center gap-1 transition-colors">
                                            Fix Issue <ArrowRight className="size-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <PremiumFeatureGate
                        className="mt-6"
                        requiredPlan="growth"
                        featureTitle="Plan de Acción SEO Avanzado"
                        featureDescription="Obtén un roadmap exacto paso a paso (30 Días) para corregir todos los errores técnicos y subir tu puntuación a 90+."
                        featureBenefits={[
                            "Checklist semanal estructurado y priorizado",
                            "Sincronización a 1-clic con Calendar",
                            "Tiempos de esfuerzo estimados por tarea"
                        ]}
                    >
                        <div className="border border-white/10 bg-surface-dark rounded-3xl overflow-hidden shadow-2xl p-6 lg:p-8">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Clock className="size-5 text-slate-300" /> 30 Day Action Plan
                                    </h3>
                                    <p className="text-slate-400 text-sm mt-1">Strategic roadmap to improve your SEO health score to 90+.</p>
                                </div>
                                <button onClick={handleCalendarSync} className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-white/5 border border-white/20 text-slate-300 hover:text-white font-semibold rounded-xl transition-colors text-sm shrink-0">
                                    Sync to Calendar <Download className="size-4" />
                                </button>
                            </div>

                            <div className="relative">
                                <div className="hidden lg:block absolute top-[28px] left-0 right-0 h-px bg-white/10" />

                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8">
                                    {auditData.actionPlan.map((week: any, idx: number) => (
                                        <div key={idx} className="relative z-10 flex flex-row lg:flex-col gap-4">
                                            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 w-32 lg:w-auto shrink-0">
                                                <div className={cn(
                                                    "size-14 rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 shadow-lg bg-surface-dark",
                                                    idx === 0 ? "border-blue-500 shadow-blue-500/20" : "border-white/10"
                                                )}>
                                                    <span className={cn("text-[9px] font-bold uppercase tracking-widest", idx === 0 ? "text-blue-400" : "text-slate-500")}>Week</span>
                                                    <span className={cn("text-xl font-black", idx === 0 ? "text-white" : "text-slate-400")}>0{week.week}</span>
                                                </div>
                                                <div className="hidden lg:block ml-2">
                                                    <h4 className="text-sm font-bold text-white whitespace-nowrap">{week.title}</h4>
                                                    <p className="text-sm text-slate-500 mt-0.5">{week.dateRange}</p>
                                                </div>
                                            </div>

                                            <div className="flex-1 bg-black/20 border border-white/5 rounded-2xl p-4">
                                                <div className="lg:hidden mb-4">
                                                    <h4 className="text-sm font-bold text-white whitespace-nowrap">{week.title}</h4>
                                                    <p className="text-sm text-slate-500 mt-0.5">{week.dateRange}</p>
                                                </div>
                                                <ul className="space-y-3">
                                                    {week.tasks.map((task: any, tIdx: number) => (
                                                        <li key={tIdx} className="flex items-start gap-3">
                                                            <div className="mt-0.5">
                                                                {idx === 0 ? (
                                                                    <CheckCircle2 className={cn("size-4", task.status === 'done' ? "text-emerald-500" : "text-amber-500")} />
                                                                ) : (
                                                                    <div className="size-4 rounded-full border border-white/20 mt-0.5" />
                                                                )}
                                                            </div>
                                                            <span className={cn("text-sm leading-tight", idx === 0 ? "text-slate-200" : "text-slate-500")}>{task.name}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </PremiumFeatureGate>

                </motion.div>
            )}
        </div>
    );
}

function BuilderTabContent({ projectId, projectContext, loadedBlueprint, onSaveItem, initialKeyword = '' }: { projectId?: string, projectContext?: ActiveProjectData, loadedBlueprint?: SavedLandingBlueprint | null, onSaveItem?: (item: { itemId: string, type: string, title: string, data?: any }) => void, initialKeyword?: string }) {
    const { currentUser } = useAuth();
    const { totalLimits, metrics, currentPlanId } = useUserMetrics();
    const isSoloPlan = currentPlanId === 'solo';
    const [isGenerating, setIsGenerating] = useState(false);
    const [auditData, setAuditData] = useState<BlueprintData | null>(null);

    // Form States
    const [contentType, setContentType] = useState('Landing Page');
    const [objective, setObjective] = useState('Lead Capture (Opt-in)');
    const [trafficSource, setTrafficSource] = useState('Meta Ads (Social)');
    const [targetAudience, setTargetAudience] = useState('');

    // Tone States
    const [toneFileContent, setToneFileContent] = useState('');
    const [toneFileName, setToneFileName] = useState('');
    const [urlContext, setUrlContext] = useState('');
    const [matchScale, setMatchScale] = useState(80);
    const [allowInternetSearch, setAllowInternetSearch] = useState(true);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (loadedBlueprint) {
            setContentType(loadedBlueprint.contentType);
            setObjective(loadedBlueprint.objective);
            setTrafficSource(loadedBlueprint.trafficSource);
            setTargetAudience(loadedBlueprint.targetAudience);
            setAuditData(loadedBlueprint.data);

            // Note: we don't reload tone settings as they are input-only and large.
        }
    }, [loadedBlueprint]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setToneFileName(file.name);

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result;
            if (typeof text === 'string') {
                setToneFileContent(text);
            }
        };
        reader.readAsText(file);
    };

    const handleGenerate = async () => {
        if (!projectId) {
            alert("Please select a project first.");
            return;
        }
        setIsGenerating(true);
        // logContentGenerated handles analytics (Assuming it's globally available or mocked)
        const totalTokensUsed = metrics.tokensUsed || 0;
        const tokensRemaining = (totalLimits.tokens || 50000) - totalTokensUsed;

        try {
            validateQuota(tokensRemaining, currentUser?.email);
            const result = await generateLandingBlueprint({
                contentType,
                objective,
                trafficSource,
                targetAudience: targetAudience || "General Audience",
                toneOfVoice: {
                    fileContent: toneFileContent,
                    urlContext,
                    matchScale: isSoloPlan && matchScale > 50 ? 50 : matchScale,
                    allowInternetSearch
                }
            }, currentUser?.uid, projectContext || undefined);

            setAuditData(result);

            // Save to Firestore
            const savedId = await saveLandingBlueprint(
                projectId,
                contentType,
                objective,
                trafficSource,
                targetAudience || "General Audience",
                result
            );

            if (onSaveItem) {
                onSaveItem({
                    itemId: savedId,
                    type: 'Landing Blueprint',
                    title: `${objective} ${contentType}`,
                    data: result
                });
            }

        } catch (error) {
            console.error(error);
            alert("Failed to generate blueprint. Check console.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight leading-tight">Offer & Landing Page Builder</h2>
                    <p className="text-slate-400 text-sm mt-1">Audit your offer structure and generate implementation-ready copy aligned with your goal.</p>
                </div>
                {auditData && (
                    <button onClick={async () => {
                        let mdStr = `# ${objective} - ${contentType}\n\n`;
                        auditData.blueprint.forEach(sec => {
                            mdStr += `## ${sec.sectionName}\n\n`;
                            mdStr += `${sec.copyBlocks}\n\n`;
                        });
                        try {
                            await exportToDocx(mdStr, 'Landing_Blueprint');
                        } catch (e) {
                            alert("Error exporting document.");
                        }
                    }} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/10 text-sm">
                        <FileText className="size-4" /> Exportar
                    </button>
                )}
            </div>

            {!auditData ? (
                <div className="py-12 flex flex-col items-center justify-center border border-white/5 rounded-3xl bg-white/[0.02]">
                    <LayoutTemplate className="size-12 text-blue-500 mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Draft your next campaign</h3>
                    <p className="text-slate-400 max-w-md text-center text-sm mb-8">Define your objective, traffic source, and brand voice to instantiate a high-converting landing page structured blueprint.</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl px-8">
                        {/* Left Column: Core Settings */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-white uppercase tracking-widest border-b border-white/10 pb-2">Core Strategy</h4>

                            <div>
                                <label className="text-sm text-slate-400 font-bold uppercase mb-1 block">Content Type</label>
                                <select value={contentType} onChange={e => setContentType(e.target.value)} className="bg-surface-dark w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                                    <option>Landing Page</option>
                                    <option>Sales Page</option>
                                    <option>Lead Magnet Page</option>
                                    <option>Webinar Registration</option>
                                    <option>Blog Post</option>
                                    <option>Home Page</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 font-bold uppercase mb-1 block">Primary Objective</label>
                                <select value={objective} onChange={e => setObjective(e.target.value)} className="bg-surface-dark w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                                    <option>Lead Capture (Opt-in)</option>
                                    <option>Book a Call</option>
                                    <option>E-commerce Purchase</option>
                                    <option>Lead Generation</option>
                                    <option>Webinar Registration</option>
                                    <option>Consultation Booking</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 font-bold uppercase mb-1 block">Traffic Source</label>
                                <select value={trafficSource} onChange={e => setTrafficSource(e.target.value)} className="bg-surface-dark w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                                    <option>Meta Ads (Social)</option>
                                    <option>Google Ads (Search)</option>
                                    <option>LinkedIn Ads</option>
                                    <option>Organic Search (SEO)</option>
                                    <option>Email Marketing</option>
                                    <option>Direct/Referral</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 font-bold uppercase mb-1 block">Target Audience</label>
                                <input
                                    type="text"
                                    value={targetAudience}
                                    onChange={e => setTargetAudience(e.target.value)}
                                    placeholder="e.g. B2B SaaS Founders, Local Plumbers..."
                                    className="bg-surface-dark w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 placeholder:text-slate-600"
                                />
                            </div>
                        </div>

                        {/* Right Column: Tone & Voice */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-white uppercase tracking-widest border-b border-white/10 pb-2">Brand Voice & Tone</h4>

                            <div>
                                <label className="text-sm text-slate-400 font-bold uppercase mb-1 block">Tone Reference (TXT/PDF)</label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-surface-dark border border-white/10 border-dashed hover:border-blue-500/50 cursor-pointer text-white text-sm rounded-xl px-4 py-3 flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Upload className="size-4 text-slate-400" />
                                    <span className="text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap block w-full text-center">{toneFileName ? toneFileName : 'Upload Brand Guidelines'}</span>
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.pdf,.doc,.docx" />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 font-bold uppercase mb-1 block">Reference URL</label>
                                <input
                                    type="url"
                                    value={urlContext}
                                    onChange={e => setUrlContext(e.target.value)}
                                    placeholder="https://example.com/landing-page"
                                    className="bg-surface-dark w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 placeholder:text-slate-600"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm text-slate-400 font-bold uppercase">Tone Match Rigidity {isSoloPlan && <span className="ml-2 text-[11px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 normal-case tracking-normal">Max 50% (Growth Plan)</span>}</label>
                                    <span className="text-sm font-bold text-blue-400">{isSoloPlan && matchScale > 50 ? 50 : matchScale}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max={isSoloPlan ? "50" : "100"}
                                    value={isSoloPlan && matchScale > 50 ? 50 : matchScale}
                                    onChange={e => setMatchScale(parseInt(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between text-[10px] text-slate-500 mt-1 uppercase font-bold">
                                    <span>Loose Context</span>
                                    <span>Exact Pattern</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <div>
                                    <label className="text-sm text-white font-bold uppercase block">Allow Internet Search</label>
                                    <p className="text-[10px] text-slate-500">Enable AI to research external facts.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={allowInternetSearch} onChange={e => setAllowInternetSearch(e.target.checked)} />
                                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="mt-10 flex items-center justify-center min-w-[250px] px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-xl shadow-blue-500/20"
                    >
                        {isGenerating ? (
                            <><div className="size-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" /> Architecting Blueprint...</>
                        ) : 'Generate Content & Architecture'}
                    </button>

                    {/* Add invisible reference to Upload to make sure it is imported or available. 
                        Usually imported from lucide-react */}
                </div>
            ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col xl:flex-row gap-6">

                    {/* Left: Scorecard & Strategy Right Panel */}
                    <div className="xl:w-80 shrink-0 space-y-4 order-2 xl:order-1">
                        <div className="bg-surface-dark border border-white/10 rounded-2xl p-5 shadow-2xl">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Strategic Scorecard</h3>

                            <div className="space-y-4">
                                {/* Score metric */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-bold text-white">Message Clarity</span>
                                        <span className={cn("text-lg font-black", auditData.scorecard.clarity > 80 ? "text-emerald-400" : "text-amber-400")}>{auditData.scorecard.clarity}/100</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", auditData.scorecard.clarity > 80 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${auditData.scorecard.clarity}%` }} />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-bold text-white">CTA Strength</span>
                                        <span className={cn("text-lg font-black", auditData.scorecard.ctaStrength > 80 ? "text-emerald-400" : "text-amber-400")}>{auditData.scorecard.ctaStrength}/100</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", auditData.scorecard.ctaStrength > 80 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${auditData.scorecard.ctaStrength}%` }} />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-bold text-white">Trust & Proof</span>
                                        <span className={cn("text-lg font-black", auditData.scorecard.trustProof > 80 ? "text-emerald-400" : "text-amber-400")}>{auditData.scorecard.trustProof}/100</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", auditData.scorecard.trustProof > 80 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${auditData.scorecard.trustProof}%` }} />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-bold text-white">Audience Alignment</span>
                                        <span className={cn("text-lg font-black", auditData.scorecard.alignment > 80 ? "text-emerald-400" : "text-amber-400")}>{auditData.scorecard.alignment}/100</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", auditData.scorecard.alignment > 80 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${auditData.scorecard.alignment}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-surface-dark border border-white/10 rounded-2xl p-5 shadow-2xl">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">SEO Analysis</h3>
                            <p className="text-sm text-slate-300 leading-relaxed">{auditData.scorecard.seoAnalysis}</p>
                        </div>

                        <div className="bg-surface-dark border border-white/10 rounded-2xl p-5 shadow-2xl">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Overall Summary</h3>
                            <p className="text-sm text-slate-300 leading-relaxed">{auditData.scorecard.overallSummary}</p>
                        </div>

                        {auditData.experiments && auditData.experiments.length > 0 && (
                            <div className="bg-surface-dark border border-white/10 rounded-2xl p-5 shadow-2xl">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">A/B Experiments</h3>
                                <div className="space-y-4">
                                    {auditData.experiments.map((exp, idx) => (
                                        <div key={idx} className="border-l-2 border-purple-500 pl-3">
                                            <h4 className="text-sm font-bold text-white">{exp.title}</h4>
                                            <p className="text-[11px] text-slate-400 mt-1 italic">"{exp.hypothesis}"</p>
                                            <span className="text-[10px] font-bold text-purple-400 uppercase mt-1 block tracking-widest">Measure: {exp.metrics}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Blueprint & Copy Blocks Manager */}
                    <div className="flex-1 space-y-4 order-1 xl:order-2">
                        {auditData.blueprint.map((section, idx) => (
                            <div key={idx} className="bg-surface-dark border border-white/10 rounded-2xl overflow-hidden shadow-2xl group relative transition-all hover:border-white/20">
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                                    <div className="flex items-center gap-3">
                                        <div className="size-6 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold flex items-center justify-center shrink-0">
                                            {idx + 1}
                                        </div>
                                        <h3 className="text-base font-bold text-white">{section.sectionName}</h3>
                                    </div>
                                    <button
                                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 text-sm font-semibold"
                                        onClick={() => navigator.clipboard.writeText(section.copyBlocks)}
                                    >
                                        <Copy className="size-3" /> Copy Markdown
                                    </button>
                                </div>

                                {/* Body */}
                                <div className="p-6">
                                    {/* Purpose Tags */}
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {section.purposeTags.map((tag, tIdx) => (
                                            <span key={tIdx} className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-md border border-white/10 bg-white/5 text-emerald-400">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Copy Markdown Rendering */}
                                    <div className="prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-headings:text-white prose-p:text-slate-300 prose-headings:tracking-tight prose-p:leading-relaxed prose-a:text-blue-400 bg-black/40 p-4 rounded-xl border border-white/5">
                                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{section.copyBlocks}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                </motion.div>
            )}
        </div>
    );
}

function ChevronDownIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}
