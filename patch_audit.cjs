const fs = require('fs');
const file = './src/pages/WebGrowthPlan.tsx';
let content = fs.readFileSync(file, 'utf8');

const startIdx = content.indexOf('function AuditTabContent() {');
const endIdx = content.indexOf('function BuilderTabContent(');

if (startIdx !== -1 && endIdx !== -1) {
  const newFunc = `function AuditTabContent({ projectId }: { projectId?: string }) {
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditData, setAuditData] = useState<any>(null); // Type imported locally to avoid circular dep issues in this script for now, but will fix later

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
        try {
            const ai = await import('@/services/ai');
            const result = await ai.generateSeoAudit(canonicalUrl, competitors, focusPages, goal);
            setAuditData(result);
            if (projectId) {
                const auditService = await import('@/services/seoAuditService');
                await auditService.saveSeoAudit(projectId, canonicalUrl, competitors, focusPages, goal, result);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsAuditing(false);
        }
    };

    const handleCalendarSync = () => {
        if (!auditData) return;
        let icsContent = "BEGIN:VCALENDAR\\nVERSION:2.0\\nPRODID:-//Vult Intel//SEO Action Plan//EN\\n";
        auditData.actionPlan.forEach((week: any, i: number) => {
            const start = new Date();
            start.setDate(start.getDate() + (i * 7) + 1);
            const end = new Date(start);
            end.setDate(end.getDate() + 7);
            const dtstart = start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            const dtend = end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            const summary = \`SEO Plan Week \${week.week}: \${week.title}\`;
            const description = week.tasks.map((t:any) => \`- \${t.name}\`).join('\\\\n');
            icsContent += "BEGIN:VEVENT\\n";
            icsContent += \`UID:\${Date.now()}-\${i}@vultintel\\n\`;
            icsContent += \`DTSTAMP:\${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\\n\`;
            icsContent += \`DTSTART:\${dtstart}\\n\`;
            icsContent += \`DTEND:\${dtend}\\n\`;
            icsContent += \`SUMMARY:\${summary}\\n\`;
            icsContent += \`DESCRIPTION:\${description}\\n\`;
            icsContent += "END:VEVENT\\n";
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
                    <button onClick={handleCalendarSync} className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-blue-400 hover:text-blue-300 font-semibold rounded-xl transition-colors border border-blue-500/20 text-sm">
                        <Download className="size-4" /> Export Report
                    </button>
                )}
            </div>

            <div className="p-5 bg-[#161616] border border-white/10 rounded-2xl flex flex-col gap-4 shadow-xl">
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
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Competitors to Compare</label>
                        <div className="flex gap-2">
                             <input type="text" value={competitorUrl} onChange={(e) => setCompetitorUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddCompetitor()} placeholder="https://competitor.com" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                            <button onClick={handleAddCompetitor} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"><Plus className="size-4" /></button>
                        </div>
                        {competitors.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {competitors.map(c => (
                                    <span key={c} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-lg border border-blue-500/30">
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
                        <div className="lg:col-span-2 p-8 bg-[#161616] rounded-2xl border border-white/10 flex flex-col md:flex-row items-center gap-10 shadow-xl overflow-hidden relative">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

                            <div className="relative size-48 shrink-0 flex items-center justify-center">
                                <svg className="size-full transform -rotate-90">
                                    <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
                                    <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={2 * Math.PI * 88} strokeDashoffset={2 * Math.PI * 88 * (1 - auditData.overallHealth.totalScore / 100)} className={auditData.overallHealth.totalScore >= 80 ? 'text-blue-500' : auditData.overallHealth.totalScore >= 60 ? 'text-amber-500' : 'text-red-500'} strokeLinecap="round" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                    <span className="text-5xl font-black text-white">{auditData.overallHealth.totalScore}</span>
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Total Score</span>
                                </div>
                            </div>
                            
                            <div className="flex-1 space-y-6 z-10">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-2xl font-bold text-white">Overall Health</h3>
                                        {auditData.overallHealth.totalScore >= 80 ? (
                                             <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider rounded-lg">Good Standing</span>
                                        ) : (
                                            <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider rounded-lg">Needs Work</span>
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
                                             <div className="h-full bg-emerald-400 rounded-full" style={{ width: \`\${auditData.overallHealth.subscores.technical}%\` }} />
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between mb-3 text-sm font-bold text-slate-300">
                                            <span className="flex items-center gap-2"><FileText className="size-4 text-purple-400" /> Content</span>
                                            <span>{auditData.overallHealth.subscores.content}<span className="text-slate-500 text-xs">/100</span></span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                             <div className="h-full bg-purple-400 rounded-full" style={{ width: \`\${auditData.overallHealth.subscores.content}%\` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-1 border border-white/10 bg-[#161616] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
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
                                <p className="text-slate-400 text-xs mt-0.5">Issues ranked by potential impact on SERP performance.</p>
                            </div>
                        </div>
                        <div className="flex bg-black/40 border border-white/10 rounded-lg overflow-hidden p-1">
                            {['All', 'Critical', 'Warnings'].map(tab => (
                                <button key={tab} className={cn("px-4 py-1.5 text-xs font-bold rounded-md transition-colors w-24 text-center", tab === 'All' ? "bg-[#333] text-white" : "text-slate-500 hover:text-slate-300")}>
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
                                <div key={idx} className={cn("bg-[#161616] border border-white/10 rounded-2xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden border-l-4", borderColor)}>
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
                                        <button className="text-blue-400 hover:text-blue-300 text-xs font-bold tracking-wide flex items-center gap-1 transition-colors">
                                            Fix Issue <ArrowRight className="size-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="border border-white/10 bg-[#161616] rounded-3xl overflow-hidden shadow-2xl p-6 lg:p-8">
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

                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
                                {auditData.actionPlan.map((week: any, idx: number) => (
                                    <div key={idx} className="relative z-10 flex flex-row lg:flex-col gap-4">
                                        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 w-32 lg:w-auto shrink-0">
                                            <div className={cn(
                                                "size-14 rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 shadow-lg bg-[#161616]", 
                                                idx === 0 ? "border-blue-500 shadow-blue-500/20" : "border-white/10"
                                            )}>
                                                <span className={cn("text-[9px] font-bold uppercase tracking-widest", idx === 0 ? "text-blue-400" : "text-slate-500")}>Week</span>
                                                <span className={cn("text-xl font-black", idx === 0 ? "text-white" : "text-slate-400")}>0{week.week}</span>
                                            </div>
                                            <div className="hidden lg:block ml-2">
                                                <h4 className="text-sm font-bold text-white whitespace-nowrap">{week.title}</h4>
                                                <p className="text-xs text-slate-500 mt-0.5">{week.dateRange}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 bg-black/20 border border-white/5 rounded-2xl p-4">
                                            <div className="lg:hidden mb-4">
                                                <h4 className="text-sm font-bold text-white whitespace-nowrap">{week.title}</h4>
                                                <p className="text-xs text-slate-500 mt-0.5">{week.dateRange}</p>
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

                </motion.div>
            )}
        </div>
    );
}
`;

  const newContent = content.substring(0, startIdx) + newFunc + '\n' + content.substring(endIdx);
  fs.writeFileSync(file, newContent, 'utf8');
  console.log('Patched AuditTabContent successfully.');
} else {
  console.log('Could not find boundaries.');
}
