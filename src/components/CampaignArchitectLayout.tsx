import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Globe,
    Users,
    Layers,
    ChevronDown,
    Save,
    Download,
    Plus,
    CheckCircle2,
    MoreHorizontal,
    Mail,
    Zap,
    Copy,
    Trash2,
    FileText,
    Share,
    Layout as LayoutIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProject } from '@/contexts/ProjectContext';
import { getBuyerPersonas, BuyerPersona } from '@/services/brandStrategyService';
import { useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { EmailStrategyBuilder } from './campaign-architect/EmailStrategyBuilder';

type TabType = 'email' | 'ads';

export default function CampaignArchitectLayout() {
    const { activeProject, isLoading } = useProject();
    const projectId = activeProject?.project?.id;

    const [activeTab, setActiveTab] = useState<TabType>('email');
    const [isBrandVoiceActive, setIsBrandVoiceActive] = useState(true);

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

    const currentProjectName = isLoading ? "Syncing..." : (activeProject?.project?.name || "Select Project");
    const currentCampaign = "Q1 Growth Sprint"; // Still hardcoded as campaigns aren't built yet


    return (
        <div className="flex w-full bg-background-dark text-slate-100 font-sans">

            {/* Main Content Side */}
            <div className="flex-1 flex flex-col min-w-0 relative">

                {/* Page Action Bar (replaces the artificial sub-header) */}
                <div className="px-6 py-6 mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-border bg-background-dark">
                    <div className="flex flex-wrap items-center gap-4">

                        {/* Country/Language Selector */}
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-dark transition-colors group">
                            <Globe className="size-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider leading-none">Region</span>
                                <span className="text-xs font-medium text-slate-300 group-hover:text-amber-400 transition-colors">US / English</span>
                            </div>
                        </button>

                        <div className="h-8 w-px bg-surface-border mx-1 hidden sm:block" />

                        {/* Buyer Persona Selector */}
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">Persona</span>
                            <div className="relative group">
                                <select
                                    value={selectedPersonaId || ''}
                                    onChange={(e) => setSelectedPersonaId(e.target.value)}
                                    className="appearance-none bg-surface-dark/50 hover:bg-surface-dark border border-surface-border backdrop-blur-md px-3 py-1.5 -ml-2 rounded-xl transition-all duration-200 text-sm font-semibold text-slate-100 outline-none cursor-pointer pr-8"
                                    disabled={personas.length === 0}
                                >
                                    {personas.length === 0 ? (
                                        <option value="" disabled className="bg-[#0F1115]">No Personas</option>
                                    ) : (
                                        personas.map(p => (
                                            <option key={p.id} value={p.id} className="bg-[#0F1115]">
                                                {p.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <ChevronDown className="size-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-slate-300 transition-colors" />
                            </div>
                        </div>

                        <div className="h-8 w-px bg-surface-border mx-1 hidden sm:block" />

                        {/* Campaign Selector */}
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-dark transition-colors group">
                            <Layers className="size-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider leading-none">Campaign</span>
                                <span className="text-xs font-medium text-slate-300 group-hover:text-amber-400 transition-colors flex items-center gap-1">
                                    {currentCampaign}
                                    <Plus className="size-3 text-blue-400 ml-1" />
                                </span>
                            </div>
                        </button>
                    </div>

                    <div className="flex items-center gap-4 mt-4 sm:mt-0">
                        {/* Brand Voice Indicator */}
                        <button
                            onClick={() => setIsBrandVoiceActive(!isBrandVoiceActive)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-full transition-all duration-200 border",
                                isBrandVoiceActive
                                    ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                    : "bg-surface-dark border-surface-border text-slate-500"
                            )}
                        >
                            <Zap className={cn("size-3.5", isBrandVoiceActive ? "fill-blue-400" : "")} />
                            <span className="text-[11px] font-bold tracking-tight uppercase">Brand Voice</span>
                            <div className={cn(
                                "size-1.5 rounded-full",
                                isBrandVoiceActive ? "bg-blue-500 animate-pulse" : "bg-slate-600"
                            )} />
                        </button>

                        <div className="h-8 w-px bg-surface-border mx-1" />

                        <div className="flex items-center gap-2">
                            <button className="p-2.5 bg-surface-dark hover:bg-surface-dark/80 border border-surface-border text-slate-400 hover:text-white rounded-xl transition-colors active:scale-95">
                                <Save className="size-4" />
                            </button>
                            <button className="p-2.5 bg-surface-dark hover:bg-surface-dark/80 border border-surface-border text-slate-400 hover:text-white rounded-xl transition-colors active:scale-95">
                                <Download className="size-4" />
                            </button>
                            <button className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 ml-2">
                                Generate
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="px-8 mt-6">
                    <div className="flex items-center gap-8 border-b border-white/5">
                        <button
                            onClick={() => setActiveTab('email')}
                            className={cn(
                                "pb-3 text-sm font-bold transition-all duration-200 ease-out relative",
                                activeTab === 'email' ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Mail className="size-4" />
                                Email Marketing Center
                            </div>
                            {activeTab === 'email' && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('ads')}
                            className={cn(
                                "pb-3 text-sm font-bold transition-all duration-200 ease-out relative",
                                activeTab === 'ads' ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Zap className="size-4" />
                                Ads Creative & Messaging
                            </div>
                            {activeTab === 'ads' && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                />
                            )}
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-0">
                    {!projectId ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
                            <div className="size-20 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-inner">
                                <LayoutIcon className="size-10 text-blue-400/80" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold tracking-tight text-white">Select a Project</h2>
                                <p className="text-slate-400 leading-relaxed">
                                    Campaign Architect requires an active project context. Please select a project from the header to begin building campaigns.
                                </p>
                            </div>
                        </div>
                    ) : personas.length === 0 && !isFetchingPersonas ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
                            <div className="size-20 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-inner">
                                <Users className="size-10 text-amber-500/80" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold tracking-tight text-white">No Personas Defined</h2>
                                <p className="text-slate-400 leading-relaxed">
                                    You need at least one buyer persona to construct targeted campaigns. Head over to Global Brand Strategy to build your first one.
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
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="h-full"
                            >
                                {activeTab === 'email' ? (
                                    <div className="w-full h-full">
                                        <EmailStrategyBuilder persona={personas.find(p => p.id === selectedPersonaId)} />
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-w-4xl mx-auto py-12 text-center opacity-40">
                                        <Zap className="size-16 mx-auto text-slate-600 mb-6" />
                                        <h2 className="text-2xl font-bold text-white">Ads Creative & Messaging Toolkit</h2>
                                        <p className="text-slate-400 max-w-md mx-auto">Generate multi-channel ad copy, hooks, and creative briefs optimized for conversions.</p>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>

            </div>

            {/* Persistent Campaign Tray (Right Panel) */}
            <aside className="w-80 h-full border-l border-white/5 bg-white/5 backdrop-blur-3xl flex flex-col z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.3)]">
                {/* Tray Header */}
                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Campaign Tray</h3>
                    </div>
                    <button className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-slate-500">
                        <MoreHorizontal className="size-4" />
                    </button>
                </div>

                {/* Scrollable Items Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {/* Empty State Mock */}
                    <div className="h-full flex flex-col items-center justify-center py-20 text-center space-y-4 px-6">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 border-dashed">
                            <Plus className="size-6 text-slate-700" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Workspace Empty</p>
                            <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">Generated assets will appear here for batch processing and export.</p>
                        </div>
                    </div>
                </div>

                {/* Fixed Bottom Actions */}
                <div className="p-4 border-t border-white/5 bg-black/40 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <button className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white/5 hover:bg-white/10 text-[11px] font-bold text-white rounded-xl transition-all border border-white/5 uppercase tracking-wide">
                            <Copy className="size-3.5" />
                            Copy All
                        </button>
                        <button className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white/5 hover:bg-white/10 text-[11px] font-bold text-white rounded-xl transition-all border border-white/5 uppercase tracking-wide">
                            <Save className="size-3.5" />
                            Save
                        </button>
                    </div>
                    <button className="w-full flex items-center justify-center gap-2 py-3 px-3 bg-blue-600/20 hover:bg-blue-600/30 text-[11px] font-bold text-blue-400 rounded-xl transition-all border border-blue-500/20 uppercase tracking-wide">
                        <Share className="size-3.5" />
                        Export to Google Docs
                    </button>
                    <button className="w-full flex items-center justify-center gap-2 py-2 px-3 text-[10px] font-bold text-slate-600 hover:text-red-400 transition-colors uppercase tracking-widest pt-2">
                        <Trash2 className="size-3" />
                        Delete All Selected
                    </button>
                </div>
            </aside>

        </div>
    );
}
