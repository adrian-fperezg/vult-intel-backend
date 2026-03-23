import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    ChevronDown,
    Save,
    Download,
    MessageSquare,
    CheckCircle2,
    Zap,
    Layout,
    Info,
    Brain,
    Search,
    Target,
    MessageCircle,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ProjectSelector from './ProjectSelector';
import { useProject } from '@/contexts/ProjectContext';
import { getBuyerPersonas, BuyerPersona, updateBuyerPersona } from '@/services/brandStrategyService';
import { useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

type TabType = 'overview' | 'psychographics' | 'journey' | 'messaging';

export default function PersonaStudioLayout() {
    const { activeProject, isLoading } = useProject();
    const projectId = activeProject?.project?.id;

    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [isPrimary, setIsPrimary] = useState(false);
    const [confidence, setConfidence] = useState<'inferred' | 'verified'>('inferred');

    const [personas, setPersonas] = useState<BuyerPersona[]>([]);
    const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
    const [isFetchingPersonas, setIsFetchingPersonas] = useState(false);

    const loadPersonas = useCallback(async () => {
        if (!projectId) {
            setPersonas([]);
            setSelectedPersonaId(null);
            return;
        }
        setIsFetchingPersonas(true);
        try {
            const fetched = await getBuyerPersonas(projectId);
            setPersonas(fetched);
            if (fetched.length > 0 && !selectedPersonaId) {
                setSelectedPersonaId(fetched[0].id);
            }
        } catch (error) {
            console.error("Error loading personas:", error);
        } finally {
            setIsFetchingPersonas(false);
        }
    }, [projectId, selectedPersonaId]);

    useEffect(() => {
        loadPersonas();
    }, [loadPersonas]);

    const selectedPersona = personas.find(p => p.id === selectedPersonaId);

    // Initial state matching BuyerPersona fields
    const defaultFormState: Partial<BuyerPersona> = {
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
        triggerWords: ''
    };

    const [formState, setFormState] = useState<Partial<BuyerPersona>>(defaultFormState);

    // Update form state when selected persona changes
    useEffect(() => {
        if (selectedPersona) {
            setFormState({
                name: selectedPersona.name || '',
                ageRange: selectedPersona.ageRange || '',
                gender: selectedPersona.gender || '',
                location: selectedPersona.location || '',
                jobTitle: selectedPersona.jobTitle || '',
                income: selectedPersona.income || '',
                goals: selectedPersona.goals || '',
                painPoints: selectedPersona.painPoints || '',
                objections: selectedPersona.objections || '',
                mediaHabits: selectedPersona.mediaHabits || '',
                preferredTone: selectedPersona.preferredTone || '',
                triggerWords: selectedPersona.triggerWords || ''
            });
        } else {
            setFormState(defaultFormState);
        }
    }, [selectedPersonaId, personas]);

    const handleInputChange = (field: keyof BuyerPersona, value: string) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!projectId || !selectedPersonaId) return;

        try {
            const loadingToast = toast.loading('Saving persona insights...');
            await updateBuyerPersona(projectId, selectedPersonaId, formState);

            // Update local state to reflect changes without a full refetch
            setPersonas(prev => prev.map(p =>
                p.id === selectedPersonaId ? { ...p, ...formState } : p
            ));

            toast.success('Persona updated successfully!', { id: loadingToast });
        } catch (error) {
            console.error('Error saving persona:', error);
            toast.error('Failed to save persona.');
        }
    };

    return (
        <div className="flex w-full bg-background-dark text-slate-100 font-sans selection:bg-blue-500/30">

            {/* Main Container */}
            <div className="flex-1 flex flex-col min-w-0 relative">

                {/* Page Action Bar (replaces the artificial sub-header) */}
                <div className="px-8 py-6 mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-border bg-background-dark">
                    <div className="flex items-center gap-6">

                        {/* Persona Selector */}
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">Active Persona</span>
                            <div className="relative group">
                                <select
                                    value={selectedPersonaId || ''}
                                    onChange={(e) => setSelectedPersonaId(e.target.value)}
                                    className="appearance-none bg-surface-dark/50 hover:bg-surface-dark border border-surface-border backdrop-blur-md px-3 py-1.5 -ml-2 rounded-xl transition-all duration-200 text-sm font-semibold text-slate-100 outline-none cursor-pointer pr-8"
                                    disabled={personas.length === 0}
                                >
                                    {personas.length === 0 ? (
                                        <option value="" disabled className="bg-[#0F1115]">No Personas Found</option>
                                    ) : (
                                        personas.map(p => (
                                            <option key={p.id} value={p.id} className="bg-[#0F1115]">
                                                {p.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <ChevronDown className="size-4 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-slate-300 transition-colors" />
                            </div>
                        </div>

                        {/* Confidence Indicator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-dark/50 backdrop-blur-md rounded-full border border-surface-border">
                            <div className={cn(
                                "size-1.5 rounded-full shadow-[0_0_8px]",
                                confidence === 'verified' ? "bg-emerald-500 shadow-emerald-500/50" : "bg-amber-500 shadow-amber-500/50 animate-pulse"
                            )} />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                {confidence === 'verified' ? 'Verified Insight' : 'AI Inferred'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 mt-4 sm:mt-0">
                        {/* The Golden Toggle */}
                        <div className="flex items-center gap-3 px-4 py-2 bg-surface-dark/50 backdrop-blur-md rounded-2xl border border-surface-border">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Global Priority</span>
                                <span className="text-[10px] font-medium text-slate-400 italic">Set as Primary</span>
                            </div>
                            <button
                                onClick={() => setIsPrimary(!isPrimary)}
                                className={cn(
                                    "relative w-10 h-5 rounded-full transition-all duration-300 ease-in-out border",
                                    isPrimary ? "bg-blue-600 border-blue-400/50 shadow-[0_0_15px_rgba(37,99,235,0.4)]" : "bg-slate-800 border-white/10"
                                )}
                            >
                                <div className={cn(
                                    "absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white transition-all duration-300 shadow-sm",
                                    isPrimary ? "translate-x-5" : "translate-x-0"
                                )} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSave}
                                disabled={!selectedPersonaId}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                            >
                                <Save className="size-4" />
                                Save
                            </button>
                            <button className="p-2.5 bg-surface-dark hover:bg-surface-dark/80 border border-surface-border text-slate-300 hover:text-white rounded-xl transition-all active:scale-95">
                                <Download className="size-4.5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <nav className="px-10 mt-8 flex-shrink-0">
                    <div className="flex items-center gap-10 border-b border-white/5">
                        {[
                            { id: 'overview', label: 'Overview', icon: CheckCircle2 },
                            { id: 'psychographics', label: 'Psychographics', icon: Brain },
                            { id: 'journey', label: 'Buying Journey', icon: ArrowRight },
                            { id: 'messaging', label: 'Messaging Strategy', icon: MessageCircle },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={cn(
                                    "pb-4 text-xs font-bold tracking-widest uppercase transition-all duration-200 ease-out relative flex items-center gap-2",
                                    activeTab === tab.id ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                                )}
                            >
                                <tab.icon className="size-3.5" />
                                {tab.label}
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="activeTabPersona"
                                        className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)] rounded-t-full"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </nav>

                {/* Scrollable Content Area */}
                <main className="flex-1 overflow-y-auto custom-scrollbar p-10 relative">
                    {!projectId ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
                            <div className="size-20 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-inner">
                                <Layout className="size-10 text-blue-400/80" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold tracking-tight text-white">Select a Project</h2>
                                <p className="text-slate-400 leading-relaxed">
                                    Persona Studio requires an active project context. Please select a project from the header to begin building deep human-centric strategies.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    // Trigger the global selector if possible, but for now we just show the message
                                }}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg shadow-blue-600/20 flex items-center gap-2"
                            >
                                <Users className="size-4" />
                                Open Projects Hub
                            </button>
                        </div>
                    ) : personas.length === 0 && !isFetchingPersonas ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
                            <div className="size-20 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-inner">
                                <Users className="size-10 text-amber-500/80" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold tracking-tight text-white">No Personas Defined</h2>
                                <p className="text-slate-400 leading-relaxed">
                                    You haven't defined any buyer personas for this project yet. Head over to Global Brand Strategy to build your first target character.
                                </p>
                            </div>
                            <Link to="/global-brand-strategy" className="px-6 py-3 bg-white text-black font-bold rounded-full transition-all active:scale-95 shadow-lg flex items-center gap-2">
                                <Zap className="size-4" />
                                Define Personas
                            </Link>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab + (selectedPersonaId || '')}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                className="max-w-6xl mx-auto h-full"
                            >
                                {activeTab === 'overview' && (
                                    <div className="bg-surface-dark border border-white/10 rounded-3xl p-8 shadow-xl">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="size-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                                                <Users className="size-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-white">Demographics & Overview</h2>
                                                <p className="text-sm text-slate-400">Basic information to identify this persona.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="col-span-1 md:col-span-2">
                                                <label className="text-sm font-medium text-slate-400 block mb-1.5">Full Name</label>
                                                <input
                                                    type="text"
                                                    value={formState.name || ''}
                                                    onChange={e => handleInputChange('name', e.target.value)}
                                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 shadow-inner"
                                                    disabled
                                                />
                                                <p className="text-xs text-slate-500 mt-1">To change the name, please use Global Brand Strategy.</p>
                                            </div>

                                            {([
                                                ['jobTitle', 'Job Title / Role', 'e.g. Marketing Director'],
                                                ['ageRange', 'Age Range', 'e.g. 28-40'],
                                                ['gender', 'Gender', 'e.g. Female'],
                                                ['location', 'Location', 'e.g. Miami, FL'],
                                                ['income', 'Income / Budget', 'e.g. $80K-$120K/yr']
                                            ] as const).map(([field, label, ph]) => (
                                                <div key={field} className={field === 'jobTitle' ? 'col-span-1 md:col-span-2' : ''}>
                                                    <label className="text-sm font-medium text-slate-400 block mb-1.5">{label}</label>
                                                    <input
                                                        type="text"
                                                        value={formState[field] || ''}
                                                        onChange={e => handleInputChange(field, e.target.value)}
                                                        placeholder={ph}
                                                        className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 shadow-inner"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'psychographics' && (
                                    <div className="bg-surface-dark border border-white/10 rounded-3xl p-8 shadow-xl">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="size-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                                                <Brain className="size-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-white">Psychographics & Mindset</h2>
                                                <p className="text-sm text-slate-400">Deep dive into what drives their decisions.</p>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            {([
                                                ['goals', 'Goals & Desires', 'What are their main objectives, both professional and personal?', 3],
                                                ['painPoints', 'Pain Points', 'What frustrates them? What problems are they trying to solve?', 3],
                                                ['objections', 'Common Objections', 'Why might they hesitate to buy from you?', 2],
                                                ['mediaHabits', 'Media & Platform Habits', 'Where do they consume information? (e.g. LinkedIn, specific blogs, podcasts)', 2]
                                            ] as const).map(([field, label, ph, rows]) => (
                                                <div key={field}>
                                                    <label className="text-sm font-medium text-slate-400 block mb-1.5">{label}</label>
                                                    <textarea
                                                        value={formState[field] || ''}
                                                        onChange={e => handleInputChange(field, e.target.value)}
                                                        placeholder={ph}
                                                        rows={rows}
                                                        className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 shadow-inner resize-y min-h-[80px]"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'messaging' && (
                                    <div className="bg-surface-dark border border-white/10 rounded-3xl p-8 shadow-xl">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="size-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                                <MessageCircle className="size-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-white">Messaging Strategy</h2>
                                                <p className="text-sm text-slate-400">How to effectively communicate with this persona.</p>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <div>
                                                <label className="text-sm font-medium text-slate-400 block mb-1.5">Preferred Tone</label>
                                                <input
                                                    type="text"
                                                    value={formState.preferredTone || ''}
                                                    onChange={e => handleInputChange('preferredTone', e.target.value)}
                                                    placeholder="e.g. Direct, no-fluff, data-driven"
                                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 shadow-inner"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium text-slate-400 block mb-1.5">Trigger Words & Phrases</label>
                                                <textarea
                                                    value={formState.triggerWords || ''}
                                                    onChange={e => handleInputChange('triggerWords', e.target.value)}
                                                    placeholder="Words that resonate: 'ROI', 'scalable', 'proven process', 'risk-free'"
                                                    rows={3}
                                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 shadow-inner resize-y"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'journey' && (
                                    <div className="bg-surface-dark border border-white/10 rounded-3xl p-12 shadow-xl flex flex-col items-center justify-center text-center">
                                        <div className="size-16 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 mb-6 border border-amber-500/20">
                                            <Target className="size-8" />
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Buying Journey Workflow</h2>
                                        <p className="text-slate-400 max-w-md">
                                            The interactive buying journey map and funnel builder is currently under development. Soon you'll be able to map specific content to awareness, consideration, and decision stages.
                                        </p>
                                    </div>
                                )}

                            </motion.div>
                        </AnimatePresence>
                    )}
                </main>

            </div>
        </div>
    );
}
