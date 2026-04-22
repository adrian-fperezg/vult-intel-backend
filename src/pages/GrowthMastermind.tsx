import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Target,
    Plus,
    Trash2,
    Copy,
    Download,
    Loader2,
    ArrowLeft,
    Sparkles,
    ChevronRight,
    ChevronDown,
    TrendingUp,
    X,
    Mail,
    Share2,
    DollarSign,
    Search,
    CalendarCheck,
    BarChart3,
    Lightbulb,
    FileText,
    Globe
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import toast from 'react-hot-toast';

import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { useProject } from '@/contexts/ProjectContext';

import { exportToDocx } from '@/utils/docxExport';

import {
    getMarketingStrategies,
    saveMarketingStrategy,
    deleteMarketingStrategy,
    MarketingStrategy
} from '@/services/growthMastermindService';
import { generateGrowthMastermindStrategy } from '@/services/ai';
import { getProjectById } from '@/services/scanService';
import { getBrandVoices, getBuyerPersonas } from '@/services/brandStrategyService';

// --- Types & Constants ---
const OBJECTIVES = [
    'Brand Awareness & Reach',
    'Lead Generation & Capture',
    'Sales Conversion & Revenue',
    'Retention & Loyalty',
    'Market Expansion'
];

// Maps a section title keyword → icon + color tokens (ordered by specificity)
function getSectionMeta(title: string) {
    const tl = title.toLowerCase();

    // Executive Summary
    if (tl.includes('executive') || tl.includes('summary') || tl.includes('overview'))
        return { Icon: BarChart3, color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20', border: 'border-blue-500/20', accent: '#3b82f6' };

    // Messaging Angles / Copy
    if (tl.includes('messaging') || tl.includes('angle') || tl.includes('copywriting') || tl.includes('headline') || tl.includes('copy'))
        return { Icon: Lightbulb, color: 'text-yellow-400', bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/20', border: 'border-yellow-500/20', accent: '#eab308' };

    // Email Marketing
    if (tl.includes('email'))
        return { Icon: Mail, color: 'text-sky-400', bg: 'bg-sky-500/10', ring: 'ring-sky-500/20', border: 'border-sky-500/20', accent: '#38bdf8' };

    // Social Media (Organic)
    if (tl.includes('social') || tl.includes('organic') || tl.includes('community'))
        return { Icon: Share2, color: 'text-purple-400', bg: 'bg-purple-500/10', ring: 'ring-purple-500/20', border: 'border-purple-500/20', accent: '#a855f7' };

    // Paid Advertising
    if (tl.includes('paid') || tl.includes('advertising') || tl.includes('ads') || tl.includes('ppc'))
        return { Icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20', border: 'border-amber-500/20', accent: '#f59e0b' };

    // SEO & Web Content
    if (tl.includes('seo') || tl.includes('content strategy') || tl.includes('web content') || tl.includes('keyword') || tl.includes('search engine'))
        return { Icon: Search, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', border: 'border-emerald-500/20', accent: '#10b981' };

    // 30-60-90 Execution Roadmap
    if (tl.includes('roadmap') || tl.includes('execution') || tl.includes('30') || tl.includes('60') || tl.includes('90') || tl.includes('day') || tl.includes('timeline'))
        return { Icon: CalendarCheck, color: 'text-rose-400', bg: 'bg-rose-500/10', ring: 'ring-rose-500/20', border: 'border-rose-500/20', accent: '#f43f5e' };

    // Global / Market Expansion
    if (tl.includes('global') || tl.includes('market') || tl.includes('expansion'))
        return { Icon: Globe, color: 'text-teal-400', bg: 'bg-teal-500/10', ring: 'ring-teal-500/20', border: 'border-teal-500/20', accent: '#14b8a6' };

    // Generic fallback for any extra sections
    return { Icon: FileText, color: 'text-slate-400', bg: 'bg-slate-500/10', ring: 'ring-slate-500/20', border: 'border-slate-500/20', accent: '#94a3b8' };
}

interface MasterplanSection { id: string; title: string; content: string; }

/**
 * Parses AI markdown into discrete sections.
 * Strategy priority:
 *  1. ## headings  (ideal — new prompt forces this)
 *  2. ### headings (fallback for older outputs)
 *  3. **Bold lines** on their own (fallback for very old outputs)
 *  4. Single catch-all "Strategy" section if nothing else is found
 */
function parseMasterplanSections(markdown: string): { title: string; sections: MasterplanSection[] } {
    if (!markdown) return { title: '', sections: [] };

    const lines = markdown.split('\n');
    let campaignTitle = '';

    // Helper: extract title text from a heading/bold line
    const cleanTitle = (line: string) =>
        line.replace(/^#+\s*/, '').replace(/^\*\*(.+)\*\*$/, '$1').trim();

    const buildSection = (title: string, bodyLines: string[]): MasterplanSection => ({
        id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        title,
        content: bodyLines.join('\n').trim()
    });

    // ── Strategy 1: split by ## (H2) ──────────────────────────────────────────
    const tryH2 = (): MasterplanSection[] => {
        const result: MasterplanSection[] = [];
        let currentTitle = '';
        let currentLines: string[] = [];
        for (const line of lines) {
            if (line.match(/^# (?!#)/)) {
                // H1 = campaign title (grab once)
                if (!campaignTitle) campaignTitle = cleanTitle(line);
            } else if (line.startsWith('## ')) {
                if (currentTitle) result.push(buildSection(currentTitle, currentLines));
                currentTitle = cleanTitle(line);
                currentLines = [];
            } else {
                currentLines.push(line);
            }
        }
        if (currentTitle) result.push(buildSection(currentTitle, currentLines));
        return result;
    };

    // ── Strategy 2: split by ### (H3) ─────────────────────────────────────────
    const tryH3 = (): MasterplanSection[] => {
        const result: MasterplanSection[] = [];
        let currentTitle = '';
        let currentLines: string[] = [];
        for (const line of lines) {
            if (line.match(/^#{1,2} (?!#)/)) {
                if (!campaignTitle) campaignTitle = cleanTitle(line);
            } else if (line.startsWith('### ')) {
                if (currentTitle) result.push(buildSection(currentTitle, currentLines));
                currentTitle = cleanTitle(line);
                currentLines = [];
            } else {
                currentLines.push(line);
            }
        }
        if (currentTitle) result.push(buildSection(currentTitle, currentLines));
        return result;
    };

    // ── Strategy 3: split by **Bold standalone lines** ────────────────────────
    const tryBold = (): MasterplanSection[] => {
        const result: MasterplanSection[] = [];
        let currentTitle = '';
        let currentLines: string[] = [];
        for (const line of lines) {
            const boldMatch = line.trim().match(/^\*\*(.{3,60})\*\*\s*:?\s*$/);
            if (boldMatch) {
                if (currentTitle) result.push(buildSection(currentTitle, currentLines));
                currentTitle = boldMatch[1].trim();
                currentLines = [];
            } else {
                if (!campaignTitle && line.trim()) campaignTitle = line.trim();
                currentLines.push(line);
            }
        }
        if (currentTitle) result.push(buildSection(currentTitle, currentLines));
        return result;
    };

    // ── Run strategies in priority order ─────────────────────────────────────
    let sections = tryH2();
    if (sections.length < 2) {
        campaignTitle = ''; // reset so H3 pass can find it
        sections = tryH3();
    }
    if (sections.length < 2) {
        campaignTitle = '';
        sections = tryBold();
    }

    // ── Final fallback: put everything in one section ─────────────────────────
    if (sections.length === 0) {
        const firstLine = lines.find(l => l.trim());
        campaignTitle = firstLine ? cleanTitle(firstLine) : 'Masterplan';
        sections = [{ id: 'full-strategy', title: 'Full Strategy', content: markdown.trim() }];
    }

    return { title: campaignTitle, sections };
}

// Custom ReactMarkdown renderers for section body text

const mdComponents: import('react-markdown').Components = {
    h3: ({ children }) => (
        <h3 className="text-sm font-bold text-slate-200 mt-6 mb-2 uppercase tracking-widest flex items-center gap-2">
            <span className="w-0.5 h-3.5 rounded-full bg-rose-500/60 inline-block shrink-0" />
            {children}
        </h3>
    ),
    h4: ({ children }) => (
        <h4 className="text-sm font-semibold text-rose-300 mt-4 mb-1.5">{children}</h4>
    ),
    p: ({ children }) => (
        <p className="text-slate-300 text-sm leading-7 mb-4">{children}</p>
    ),
    strong: ({ children }) => (
        <strong className="font-bold text-white">{children}</strong>
    ),
    ul: ({ children }) => <ul className="space-y-2 my-4 ml-1">{children}</ul>,
    ol: ({ children }) => <ol className="space-y-2 my-4 ml-1 list-none">{children}</ol>,
    li: ({ children }) => (
        <li className="flex gap-3 items-start text-slate-300 text-sm leading-6">
            <span className="mt-2 size-1.5 rounded-full bg-rose-400/70 shrink-0" />
            <span>{children}</span>
        </li>
    ),
    blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-rose-500/50 pl-4 my-4 bg-rose-500/5 rounded-r-lg py-2 pr-3">
            <span className="text-rose-200/80 text-sm italic">{children}</span>
        </blockquote>
    ),
    hr: () => <hr className="border-none h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent my-6" />,
    code: ({ children }) => (
        <code className="px-1.5 py-0.5 rounded bg-white/10 text-rose-300 text-sm font-mono">{children}</code>
    ),
};

// --- ResultsView sub-component (keeps its own expand/TOC state) ---
interface ResultsViewProps {
    campaignTitle: string;
    sections: MasterplanSection[];
    strategy: MarketingStrategy;
    onBack: () => void;
    onCopy: () => void;
    onExport: () => void;
    t: (key: string) => string;
}

function ResultsView({ campaignTitle, sections, strategy, onBack, onCopy, onExport, t }: ResultsViewProps) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        sections.forEach((s, i) => { init[s.id] = i === 0; });
        return init;
    });
    const [activeId, setActiveId] = useState(sections[0]?.id ?? '');

    const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const scrollTo = (id: string) => {
        setActiveId(id);
        setExpanded(prev => ({ ...prev, [id]: true }));
        document.getElementById(`ms-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
        >
            {/* ── Sticky toolbar ── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-surface-dark border border-surface-border shadow-lg sticky top-6 z-20 backdrop-blur-md bg-opacity-90">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h3 className="text-[15px] font-bold text-white">{campaignTitle || t('masterplanResults')}</h3>
                        <p className="text-xs text-rose-400 font-medium">{t('objective')} {strategy.objective}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={onCopy}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-surface-light hover:bg-white/5 border border-white/10 text-slate-300 text-[13px] font-bold rounded-xl transition-colors"
                    >
                        <Copy className="w-4 h-4" />{t('copy')}
                    </button>
                    <button
                        onClick={onExport}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 border border-transparent text-white text-[13px] font-bold rounded-xl transition-colors shadow-lg shadow-rose-500/20"
                    >
                        <Download className="w-4 h-4" />{t('export')}
                    </button>
                </div>
            </div>

            {/* ── Two-column layout: sidebar TOC + section cards ── */}
            <div className="flex gap-6 items-start">

                {/* Sticky sidebar TOC (desktop only) */}
                <aside className="hidden lg:flex flex-col gap-1 w-56 shrink-0 sticky top-28">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-3">Sections</p>
                    {sections.map(section => {
                        const { Icon, color, bg, ring } = getSectionMeta(section.title);
                        const isActive = activeId === section.id;
                        return (
                            <button
                                key={section.id}
                                onClick={() => scrollTo(section.id)}
                                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all text-xs font-medium ${isActive
                                    ? 'bg-white/5 text-white'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                                    }`}
                            >
                                <span className={`p-1.5 rounded-lg ${bg} ring-1 ${ring} shrink-0`}>
                                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                                </span>
                                <span className="truncate leading-tight">{section.title}</span>
                            </button>
                        );
                    })}
                </aside>

                {/* Section cards */}
                <div className="flex-1 min-w-0 space-y-4 pb-28">

                    {/* Campaign title banner */}
                    {campaignTitle && (
                        <div className="px-8 py-6 rounded-3xl bg-gradient-to-r from-rose-500/10 via-surface-dark to-surface-dark border border-rose-500/20 shadow-lg">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400 mb-1">Campaign</p>
                            <h1 className="text-2xl font-black text-white tracking-tight leading-tight">{campaignTitle}</h1>
                        </div>
                    )}

                    {sections.map(section => {
                        const { Icon, color, bg, ring, border, accent } = getSectionMeta(section.title);
                        const isOpen = expanded[section.id] ?? false;

                        return (
                            <div
                                key={section.id}
                                id={`ms-${section.id}`}
                                style={{ scrollMarginTop: '7rem' }}
                                className={`bg-surface-dark border ${border} rounded-3xl overflow-hidden transition-all duration-300 hover:brightness-105`}
                            >
                                {/* Collapsible header */}
                                <button
                                    onClick={() => toggle(section.id)}
                                    className="w-full px-8 py-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
                                >
                                    <div className="flex items-center gap-5">
                                        <div className={`p-3 ${bg} rounded-xl ring-1 ${ring} shrink-0`}>
                                            <Icon className={`size-6 ${color}`} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{section.title}</h3>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
                                                <p className="text-xs text-slate-500">
                                                    {isOpen ? 'Click to collapse' : 'Click to expand'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronDown className={`size-5 text-slate-500 transition-transform duration-300 shrink-0 ${isOpen && 'rotate-180'}`} />
                                </button>

                                {/* Animated body */}
                                <AnimatePresence>
                                    {isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-8 pb-8 pt-2 border-t border-white/5">
                                                <ReactMarkdown 
                                                  remarkPlugins={[remarkGfm]} 
                                                  rehypePlugins={[rehypeSanitize]} 
                                                  components={mdComponents}
                                                >
                                                  {section.content}
                                                </ReactMarkdown>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
}

// =============================================================
// MAIN COMPONENT
// =============================================================
export default function GrowthMastermind() {
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const { activeProjectId } = useProject();

    // --- State ---
    const [strategies, setStrategies] = useState<MarketingStrategy[]>([]);
    const [viewState, setViewState] = useState<'dashboard' | 'generator' | 'results'>('dashboard');
    const [selectedObjective, setSelectedObjective] = useState<string>(OBJECTIVES[0]);
    const [customInstructions, setCustomInstructions] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentStrategy, setCurrentStrategy] = useState<MarketingStrategy | null>(null);

    // Deletion state
    const [strategyToDelete, setStrategyToDelete] = useState<string | null>(null);

    // --- Load Data ---
    useEffect(() => {
        if (activeProjectId) {
            loadStrategies();
        }
    }, [activeProjectId]);

    const loadStrategies = async () => {
        if (!activeProjectId) return;
        try {
            const data = await getMarketingStrategies(activeProjectId);
            setStrategies(data);
        } catch (error) {
            console.error("Failed to load strategies:", error);
            toast.error('Failed to load strategies.');
        }
    };

    // --- Handlers ---
    const handleGenerate = async () => {
        if (!activeProjectId || !currentUser) {
            toast.error('No valid project or user active.');
            return;
        }

        setIsGenerating(true);
        setViewState('generator');

        try {
            // 1. Fetch Context
            const [project, brandVoices, personas] = await Promise.all([
                getProjectById(activeProjectId),
                getBrandVoices(activeProjectId),
                getBuyerPersonas(activeProjectId)
            ]);

            if (!project) throw new Error("Project not found");

            // Format Context
            const scanContext = `Project Name: ${project.name}\nNiche: ${project.niche}\nScores: Website ${project.scores.website}/100, Marketing ${project.scores.marketing}/100\n\n` +
                project.sections.map(s => `[${s.title}]\n${s.content}`).join('\n\n');

            const brandContext = brandVoices.length > 0
                ? brandVoices.map(bv => `Voice: ${bv.name}, Archetype: ${bv.archetype}, Value Prop: ${bv.valueProposition}`).join('\n')
                : 'None available';

            const personaContext = personas.length > 0
                ? personas.map(p => `Persona: ${p.name}, Goals: ${p.goals}, Pain Points: ${p.painPoints}, Tone: ${p.preferredTone}`).join('\n')
                : 'None available';

            // 2. Call AI
            const textResult = await generateGrowthMastermindStrategy(
                selectedObjective,
                scanContext,
                brandContext,
                personaContext,
                currentUser.uid,
                customInstructions
            );

            // 3. Save to Firebase
            const strategyPayload = {
                objective: selectedObjective,
                content: textResult
            };

            const newId = await saveMarketingStrategy(activeProjectId, strategyPayload);

            const newStrategy: MarketingStrategy = {
                ...strategyPayload,
                id: newId,
                projectId: activeProjectId,
                userId: currentUser.uid,
                createdAt: Date.now()
            };

            setCurrentStrategy(newStrategy);
            setStrategies([newStrategy, ...strategies]);
            setViewState('results');
            toast.success('Strategy Masterplan generated successfully!');

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Failed to generate strategy.');
            setViewState('dashboard');
        } finally {
            setIsGenerating(false);
        }
    };

    const confirmDelete = async () => {
        if (!strategyToDelete || !activeProjectId) return;
        try {
            await deleteMarketingStrategy(activeProjectId, strategyToDelete);
            setStrategies(strategies.filter(s => s.id !== strategyToDelete));
            toast.success('Strategy deleted successfully');
        } catch (error) {
            console.error(error);
            toast.error('Failed to delete strategy.');
        } finally {
            setStrategyToDelete(null);
        }
    };

    const handleCopy = () => {
        if (currentStrategy?.content) {
            navigator.clipboard.writeText(currentStrategy.content);
            toast.success('Copied to clipboard!');
        }
    };

    const handleExportDocx = async () => {
        if (currentStrategy?.content) {
            const fileName = `VultIntel_GrowthStrategy_${currentStrategy.objective.replace(/\s+/g, '')}`;
            const success = await exportToDocx(currentStrategy.content, fileName);
            if (success) {
                toast.success('Exported to DOCX');
            } else {
                toast.error('Failed to export DOCX');
            }
        }
    };

    // --- Guard ---
    if (!activeProjectId) {
        return (
            <div className="flex-1 p-8 lg:p-12 pb-24 lg:pb-12 max-w-7xl mx-auto w-full flex flex-col items-center justify-center text-center">
                <Target className="w-16 h-16 text-slate-700 mb-6" />
                <h2 className="text-2xl font-bold text-slate-300 mb-2">No Active Project</h2>
                <p className="text-slate-500 max-w-md">Please select or create a project from the Projects Hub to use the Growth Mastermind.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 p-8 lg:p-12 pb-24 lg:pb-12 max-w-7xl mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-rose-500/10 rounded-lg border border-rose-500/20">
                            <Target className="w-6 h-6 text-rose-400" />
                        </div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
                            Growth Mastermind
                        </h1>
                    </div>
                    <p className="text-slate-400 max-w-2xl text-[15px]">
                        {t('growthMastermindSubtitle')}
                    </p>
                </div>

                {viewState === 'dashboard' && (
                    <button
                        onClick={() => setViewState('generator')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-medium transition-all shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:shadow-[0_0_25px_rgba(244,63,94,0.5)] active:scale-[0.98]"
                    >
                        <Plus className="w-4 h-4" />
                        {t('newMasterplan')}
                    </button>
                )}
            </div>

            {/* Main Content */}
            <AnimatePresence mode="wait">

                {/* ── DASHBOARD ── */}
                {viewState === 'dashboard' && (
                    <motion.div
                        key="dashboard"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        {strategies.length === 0 ? (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center border border-dashed border-surface-border rounded-2xl bg-surface-dark/30">
                                <Target className="w-12 h-12 text-slate-600 mb-4" />
                                <h3 className="text-lg font-bold text-slate-300 mb-2">{t('noMasterplansYet')}</h3>
                                <p className="text-slate-500 max-w-sm mb-6">{t('noMasterplansDesc')}</p>
                            </div>
                        ) : (
                            strategies.map((strategy) => (
                                <div key={strategy.id} className="group flex flex-col p-5 rounded-2xl bg-surface-dark border border-surface-border hover:border-rose-500/50 transition-all shadow-lg hover:shadow-rose-500/10">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="p-1.5 rounded-lg bg-surface-light border border-white/5">
                                                <TrendingUp className="w-4 h-4 text-rose-400" />
                                            </span>
                                            <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">{t('masterplan')}</span>
                                        </div>
                                        <button
                                            onClick={() => setStrategyToDelete(strategy.id)}
                                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <h3 className="text-xl font-bold text-white mb-2 leading-tight">
                                        {strategy.objective}
                                    </h3>

                                    <p className="text-sm text-slate-400 line-clamp-3 mb-6 flex-1">
                                        {strategy.content.replace(/[#*]/g, '').substring(0, 150)}...
                                    </p>

                                    <div className="flex items-center justify-between pt-4 border-t border-surface-border">
                                        <span className="text-xs text-slate-500 font-medium">
                                            {new Date(strategy.createdAt).toLocaleDateString()}
                                        </span>
                                        <button
                                            onClick={() => {
                                                setCurrentStrategy(strategy);
                                                setViewState('results');
                                            }}
                                            className="flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors"
                                        >
                                            {t('viewReport')}
                                            <ChevronRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </motion.div>
                )}

                {/* ── GENERATOR (form / loading) ── */}
                {viewState === 'generator' && (
                    <motion.div
                        key="generator"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="flex flex-col items-center justify-center py-12"
                    >
                        <div className="w-full max-w-xl p-8 rounded-3xl bg-surface-dark border border-surface-border shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-rose-500/10 blur-[60px] pointer-events-none" />

                            {!isGenerating ? (
                                <>
                                    <div className="text-center mb-8 relative z-10">
                                        <div className="inline-flex p-3 rounded-2xl bg-surface-light border border-white/5 mb-4 shadow-inner">
                                            <Target className="w-8 h-8 text-rose-400" />
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">{t('configureMasterplan')}</h2>
                                        <p className="text-slate-400 text-sm">{t('configureMasterplanDesc')}</p>
                                    </div>

                                    <div className="space-y-5 relative z-10">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-300 mb-2">{t('primaryObjective')}</label>
                                            <select
                                                value={selectedObjective}
                                                onChange={(e) => setSelectedObjective(e.target.value)}
                                                className="w-full px-4 py-3 bg-background-dark border border-surface-border rounded-xl text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-rose-500/50 appearance-none shadow-inner"
                                                style={{ WebkitAppearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                            >
                                                {OBJECTIVES.map(obj => (
                                                    <option key={obj} value={obj} className="bg-surface-dark text-white">{obj}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-slate-300 mb-2">
                                                {t('customInstructions')}
                                                <span className="ml-2 text-xs font-normal text-slate-500">({t('optional')})</span>
                                            </label>
                                            <textarea
                                                value={customInstructions}
                                                onChange={(e) => setCustomInstructions(e.target.value)}
                                                rows={4}
                                                placeholder={t('customInstructionsPlaceholder')}
                                                className="w-full px-4 py-3 bg-background-dark border border-surface-border rounded-xl text-slate-200 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500/30 transition-all placeholder:text-slate-600 shadow-inner custom-scrollbar"
                                            />
                                        </div>

                                        <div className="pt-2 flex items-center justify-between gap-4">
                                            <button
                                                onClick={() => setViewState('dashboard')}
                                                className="px-5 py-3 text-slate-400 hover:text-white font-medium transition-colors"
                                            >
                                                {t('cancel')}
                                            </button>
                                            <button
                                                onClick={handleGenerate}
                                                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:shadow-[0_0_25px_rgba(244,63,94,0.5)] active:scale-[0.98]"
                                            >
                                                <Sparkles className="w-5 h-5" />
                                                {t('generateStrategy')}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                                    <div className="relative mb-8">
                                        <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-xl animate-pulse" />
                                        <Loader2 className="w-12 h-12 text-rose-500 animate-spin relative z-10" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-3">{t('synthesizingMasterplan')}</h3>
                                    <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
                                        {t('synthesizingMasterplanDesc')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* ── RESULTS (structured section cards) ── */}
                {viewState === 'results' && currentStrategy && (() => {
                    const { title: campaignTitle, sections } = parseMasterplanSections(currentStrategy.content);
                    return (
                        <ResultsView
                            key="results"
                            campaignTitle={campaignTitle}
                            sections={sections}
                            strategy={currentStrategy}
                            onBack={() => { setCurrentStrategy(null); setViewState('dashboard'); }}
                            onCopy={handleCopy}
                            onExport={handleExportDocx}
                            t={t}
                        />
                    );
                })()}

            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            {strategyToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setStrategyToDelete(null)} />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative w-full max-w-sm bg-surface-dark border border-surface-border rounded-2xl shadow-2xl overflow-hidden p-6"
                    >
                        <div className="flex items-center gap-3 mb-4 text-red-400">
                            <div className="p-2 bg-red-500/10 rounded-lg">
                                <Trash2 className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold">{t('deleteMasterplanTitle')}</h3>
                        </div>
                        <p className="text-slate-400 text-[15px] mb-6">
                            {t('deleteMasterplanDesc')}
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setStrategyToDelete(null)}
                                className="flex-1 py-2.5 text-slate-300 font-medium hover:bg-white/5 rounded-xl transition-colors"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-500/20"
                            >
                                {t('delete')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
