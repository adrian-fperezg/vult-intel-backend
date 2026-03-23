import React from 'react';
import { Target, MessageSquare, ChevronRight, Sparkles, User, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface PersonaPurposeData {
    personaId: string;
    purpose: string;
}

interface PersonaPurposeConfigProps {
    personas: { id: string; name: string; jobTitle?: string }[];
    selectedPersonaId: string;
    onPersonaChange: (id: string) => void;
    purpose: string;
    onPurposeChange: (val: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    ctaText?: string;
    mode?: 'copy' | 'design';
}

export const PersonaPurposeConfig: React.FC<PersonaPurposeConfigProps> = ({
    personas,
    selectedPersonaId,
    onPersonaChange,
    purpose,
    onPurposeChange,
    onGenerate,
    isGenerating,
    ctaText = 'Generate',
    mode = 'copy'
}) => {
    return (
        <div className="space-y-6">
            {/* Selection Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Persona Selector */}
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <User className="size-3" /> Target Buyer Persona
                    </label>
                    <div className="relative">
                        <select
                            value={selectedPersonaId}
                            onChange={(e) => onPersonaChange(e.target.value)}
                            className={cn(
                                "w-full bg-white/[0.03] border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 transition-all appearance-none",
                                !selectedPersonaId ? "border-amber-500/50 bg-amber-500/5 focus:ring-amber-500/20" : "border-white/[0.08] focus:ring-blue-500/20"
                            )}
                        >
                            <option value="" disabled className="bg-[#0F1115]">Select a Persona...</option>
                            {personas.map((p) => (
                                <option key={p.id} value={p.id} className="bg-[#0F1115]">
                                    {p.name} {p.jobTitle ? `(${p.jobTitle})` : ''}
                                </option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                            <Sparkles className="size-3.5 text-slate-600" />
                        </div>
                    </div>
                    {!selectedPersonaId && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1">
                            <Info className="size-3" /> Required for context
                        </p>
                    )}
                </div>

                {/* Purpose / Objective */}
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Target className="size-3" /> Specific Purpose / Objective
                    </label>
                    <input
                        type="text"
                        value={purpose}
                        onChange={(e) => onPurposeChange(e.target.value)}
                        placeholder="e.g., Anniversary promo, Webinar lead gen..."
                        className={cn(
                            "w-full bg-white/[0.03] border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 transition-all",
                            !purpose ? "border-amber-500/50 bg-amber-500/5 focus:ring-amber-500/20" : "border-white/[0.08] focus:ring-blue-500/20"
                        )}
                    />
                    {!purpose && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1">
                            <Info className="size-3" /> Define the 'Why' for this generation
                        </p>
                    )}
                </div>
            </div>

            {/* Action Button */}
            <button
                onClick={onGenerate}
                disabled={isGenerating || !selectedPersonaId || !purpose}
                className={cn(
                    "w-full group relative flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold transition-all overflow-hidden",
                    !selectedPersonaId || !purpose
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
                        : mode === 'copy'
                            ? "bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                            : "bg-purple-600 text-white hover:bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]"
                )}
            >
                <AnimatePresence mode="wait">
                    {isGenerating ? (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="flex items-center gap-3"
                        >
                            <Sparkles className="size-4 animate-spin" />
                            <span>Analyzing Strategy...</span>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="idle"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="flex items-center gap-2"
                        >
                            <span>{ctaText}</span>
                            <ChevronRight className="size-4 group-hover:translate-x-1 transition-transform" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Gloss Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[150%] skew-x-[45deg] group-hover:translate-x-[150%] transition-transform duration-1000" />
            </button>

            {/* Info Badge */}
            <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.02] border border-white/[0.05]">
                    <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-slate-500">Injecting Dynamic Context from Deep Scan & Brand Pillars</span>
                </div>
            </div>
        </div>
    );
};
