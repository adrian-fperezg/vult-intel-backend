import React, { useState } from 'react';
import { Mail, Settings2, Users, Target, Save, Copy, FileText, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { exportToDoc, convertMarkdownToHtml } from '@/lib/exportUtils';
import { BuyerPersona } from '@/services/brandStrategyService';

interface EmailStrategyBuilderProps {
    persona: BuyerPersona | undefined;
}

export function EmailStrategyBuilder({ persona }: EmailStrategyBuilderProps) {
    const [platformContext, setPlatformContext] = useState<string>('Mailchimp');
    const [audienceContext, setAudienceContext] = useState<string>('');
    const [campaignGoal, setCampaignGoal] = useState<string>('');

    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const PLATFORMS = [
        'Mailchimp',
        'Klaviyo',
        'HubSpot',
        'ActiveCampaign',
        'ConvertKit',
        'Generic / Custom Format'
    ];

    const handleGenerate = () => {
        if (!audienceContext || !campaignGoal) return;
        setIsGenerating(true);
        // Simulate generation
        setTimeout(() => {
            setGeneratedDraft(`**Subject:** Exclusive Access for You 🚀\n**Preview:** Here's your inside look at what we've been building...\n\nHi [First Name],\n\nBased on your interest in ${audienceContext || 'our products'}, we wanted you to be the first to know about our latest update focused on achieving: ${campaignGoal || 'your goals'}.\n\n[Your CTA Button Here]`);
            setIsGenerating(false);
        }, 1500);
    };

    const handleCopy = () => {
        if (!generatedDraft) return;
        navigator.clipboard.writeText(generatedDraft);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleExportDocs = async () => {
        if (!generatedDraft) return;
        const htmlContent = convertMarkdownToHtml(generatedDraft);
        await exportToDoc(htmlContent, 'Email Campaign Strategy');
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header / Intro */}
            <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center bg-surface-dark border border-white/5 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-blue-500/5 blur-[100px] pointer-events-none rounded-full" />

                <div className="space-y-2 z-10">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Mail className="size-6 text-blue-400" />
                        Email Strategy & Drafting
                    </h2>
                    <p className="text-slate-400 max-w-xl text-sm leading-relaxed">
                        Plan and draft your email sequences. Select your target platform context below to ensure the AI applies the correct formatting constraints and best practices. <span className="text-blue-400/80 font-medium">Vult Intel is a strategic planner; list management and sending must be done directly through your chosen platform.</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Configuration Panel */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-surface-dark border border-white/5 rounded-2xl p-6 space-y-6">
                        <div className="flex items-center gap-2 text-white font-medium border-b border-white/5 pb-4">
                            <Settings2 className="size-4 text-blue-400" />
                            Campaign Context
                        </div>

                        {/* Target Platform Context */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <LayoutIcon className="size-3" /> Target Platform Context
                            </label>
                            <select
                                value={platformContext}
                                onChange={(e) => setPlatformContext(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
                            >
                                {PLATFORMS.map(p => (
                                    <option key={p} value={p} className="bg-slate-900">{p}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                                <AlertCircle className="size-3" /> Configures structural bounds for {platformContext}.
                            </p>
                        </div>

                        {/* Manual Audience Definition */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <Users className="size-3" /> Target Audience Segment
                            </label>
                            <textarea
                                value={audienceContext}
                                onChange={(e) => setAudienceContext(e.target.value)}
                                placeholder="E.g., VIP customers who haven't purchased in 90 days..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all min-h-[100px] resize-none placeholder:text-slate-600"
                            />
                        </div>

                        {/* Campaign Goal */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <Target className="size-3" /> Campaign Objective
                            </label>
                            <input
                                type="text"
                                value={campaignGoal}
                                onChange={(e) => setCampaignGoal(e.target.value)}
                                placeholder="E.g., Drive webinar registrations..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-600"
                            />
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={!audienceContext || !campaignGoal || isGenerating}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] flex justify-center items-center gap-2"
                        >
                            {isGenerating ? (
                                <>
                                    <div className="size-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    Drafting Strategy...
                                </>
                            ) : (
                                <>Build Email Strategy</>
                            )}
                        </button>
                    </div>
                </div>

                {/* Output Panel */}
                <div className="lg:col-span-8">
                    <div className="bg-surface-dark border border-white/5 rounded-2xl h-full min-h-[500px] flex flex-col relative overflow-hidden">

                        {/* Output Header with Actions */}
                        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-2">
                                <FileText className="size-4 text-slate-400" />
                                <span className="text-sm font-medium text-slate-300">Strategy Blueprint & Drafts</span>
                            </div>

                            {generatedDraft && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            copied
                                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10"
                                        )}
                                    >
                                        {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
                                        {copied ? 'Copied' : 'Copy'}
                                    </button>
                                    <button
                                        onClick={handleExportDocs}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-medium transition-all"
                                    >
                                        <Download className="size-3.5" />
                                        Export to Docs
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Document Content */}
                        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                            {!generatedDraft ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                    <Mail className="size-12 text-slate-500 mb-4" />
                                    <p className="text-sm text-slate-400 max-w-sm">
                                        Configure your audience and goal to generate platform-optimized email sequences. All drafts will strictly adhere to {platformContext} constraints.
                                    </p>
                                </div>
                            ) : (
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <p className="whitespace-pre-wrap text-slate-300 leading-relaxed font-mono text-[13px] bg-white/[0.02] p-6 rounded-xl border border-white/5">
                                        {generatedDraft}
                                    </p>
                                </div>
                            )}
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}

// Temporary icon for internal scope
function LayoutIcon(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="3" x2="21" y1="9" y2="9" /><line x1="9" x2="9" y1="21" y2="9" /></svg>;
}
