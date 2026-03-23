const fs = require('fs');
const file = './src/pages/WebGrowthPlan.tsx';
let content = fs.readFileSync(file, 'utf8');

const startMarker = `function BuilderTabContent({ initialKeyword = '' }: { initialKeyword?: string }) {`;
const endMarker = `function ChevronDownIcon(props: any) {`;

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find start or end markers for BuilderTabContent");
    process.exit(1);
}

const newComponent = `function BuilderTabContent({ projectId, loadedBlueprint, onSaveItem, initialKeyword = '' }: { projectId?: string, loadedBlueprint?: SavedLandingBlueprint | null, onSaveItem?: (item: any) => void, initialKeyword?: string }) {
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
        if (typeof logGrowthPlanRun === 'function') logGrowthPlanRun('Landing Builder', objective);

        try {
            const result = await generateLandingBlueprint({
                contentType,
                objective,
                trafficSource,
                targetAudience: targetAudience || "General Audience",
                toneOfVoice: {
                    fileContent: toneFileContent,
                    urlContext,
                    matchScale,
                    allowInternetSearch
                }
            });

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
                    id: savedId,
                    type: 'Landing Blueprint',
                    title: \`\${objective} \${contentType}\`,
                    data: result,
                    createdAt: Date.now()
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
                    <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/10 text-sm">
                        <Download className="size-4" /> Export Draft
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
                                <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Content Type</label>
                                <select value={contentType} onChange={e => setContentType(e.target.value)} className="bg-[#161616] w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                                    <option>Landing Page</option>
                                    <option>Sales Page</option>
                                    <option>Lead Magnet Page</option>
                                    <option>Webinar Registration</option>
                                    <option>Blog Post</option>
                                    <option>Home Page</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Primary Objective</label>
                                <select value={objective} onChange={e => setObjective(e.target.value)} className="bg-[#161616] w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                                    <option>Lead Capture (Opt-in)</option>
                                    <option>Book a Call</option>
                                    <option>Direct Purchase</option>
                                    <option>Free Trial Signup</option>
                                    <option>Event/Webinar RSVP</option>
                                    <option>Brand Awareness</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Traffic Source</label>
                                <select value={trafficSource} onChange={e => setTrafficSource(e.target.value)} className="bg-[#161616] w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                                    <option>Meta Ads (Social)</option>
                                    <option>Google Ads (Search)</option>
                                    <option>LinkedIn Ads</option>
                                    <option>Organic Search (SEO)</option>
                                    <option>Email Marketing</option>
                                    <option>Direct/Referral</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Target Audience</label>
                                <input 
                                    type="text" 
                                    value={targetAudience}
                                    onChange={e => setTargetAudience(e.target.value)}
                                    placeholder="e.g. B2B SaaS Founders, Local Plumbers..."
                                    className="bg-[#161616] w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 placeholder:text-slate-600"
                                />
                            </div>
                        </div>

                        {/* Right Column: Tone & Voice */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-white uppercase tracking-widest border-b border-white/10 pb-2">Brand Voice & Tone</h4>
                            
                            <div>
                                <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Tone Reference (TXT/PDF)</label>
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-[#161616] border border-white/10 border-dashed hover:border-blue-500/50 cursor-pointer text-white text-sm rounded-xl px-4 py-3 flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Upload className="size-4 text-slate-400" />
                                    <span className="text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap block w-full text-center">{toneFileName ? toneFileName : 'Upload Brand Guidelines'}</span>
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.pdf,.doc,.docx" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Reference URL</label>
                                <input 
                                    type="url" 
                                    value={urlContext}
                                    onChange={e => setUrlContext(e.target.value)}
                                    placeholder="https://example.com/landing-page"
                                    className="bg-[#161616] w-full border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 placeholder:text-slate-600"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs text-slate-400 font-bold uppercase">Tone Match Rigidity</label>
                                    <span className="text-xs font-bold text-blue-400">{matchScale}%</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" max="100" 
                                    value={matchScale}
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
                                    <label className="text-xs text-white font-bold uppercase block">Allow Internet Search</label>
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
                        <div className="bg-[#161616] border border-white/10 rounded-2xl p-5 shadow-2xl">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Strategic Scorecard</h3>
                            
                            <div className="space-y-4">
                                {/* Score metric */}
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-bold text-white">Message Clarity</span>
                                        <span className={cn("text-lg font-black", auditData.scorecard.clarity > 80 ? "text-emerald-400" : "text-amber-400")}>{auditData.scorecard.clarity}/100</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", auditData.scorecard.clarity > 80 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: \`\${auditData.scorecard.clarity}%\` }} />
                                    </div>
                                </div>
                                
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-bold text-white">CTA Strength</span>
                                        <span className={cn("text-lg font-black", auditData.scorecard.ctaStrength > 80 ? "text-emerald-400" : "text-amber-400")}>{auditData.scorecard.ctaStrength}/100</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", auditData.scorecard.ctaStrength > 80 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: \`\${auditData.scorecard.ctaStrength}%\` }} />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-bold text-white">Trust & Proof</span>
                                        <span className={cn("text-lg font-black", auditData.scorecard.trustProof > 80 ? "text-emerald-400" : "text-amber-400")}>{auditData.scorecard.trustProof}/100</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", auditData.scorecard.trustProof > 80 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: \`\${auditData.scorecard.trustProof}%\` }} />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-sm font-bold text-white">Audience Alignment</span>
                                        <span className={cn("text-lg font-black", auditData.scorecard.alignment > 80 ? "text-emerald-400" : "text-amber-400")}>{auditData.scorecard.alignment}/100</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", auditData.scorecard.alignment > 80 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: \`\${auditData.scorecard.alignment}%\` }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#161616] border border-white/10 rounded-2xl p-5 shadow-2xl">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">SEO Analysis</h3>
                            <p className="text-sm text-slate-300 leading-relaxed">{auditData.scorecard.seoAnalysis}</p>
                        </div>

                        <div className="bg-[#161616] border border-white/10 rounded-2xl p-5 shadow-2xl">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Overall Summary</h3>
                            <p className="text-sm text-slate-300 leading-relaxed">{auditData.scorecard.overallSummary}</p>
                        </div>

                        {auditData.experiments && auditData.experiments.length > 0 && (
                            <div className="bg-[#161616] border border-white/10 rounded-2xl p-5 shadow-2xl">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">A/B Experiments</h3>
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
                            <div key={idx} className="bg-[#161616] border border-white/10 rounded-2xl overflow-hidden shadow-2xl group relative transition-all hover:border-white/20">
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                                    <div className="flex items-center gap-3">
                                        <div className="size-6 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center shrink-0">
                                            {idx + 1}
                                        </div>
                                        <h3 className="text-base font-bold text-white">{section.sectionName}</h3>
                                    </div>
                                    <button 
                                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 text-xs font-semibold"
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
                                    <div className="prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-headings:text-white prose-p:text-slate-300 prose-headings:tracking-tight prose-p:leading-relaxed prose-a:text-blue-400 bg-black/40 p-4 rounded-xl border border-white/5 whitespace-pre-wrap font-mono">
                                        {section.copyBlocks}
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

// Ensure Upload icon is imported if it isn't
function convertMarkdownToHtml(markdown: string) {
    if (!markdown) return '';
    let html = markdown
        .replace(/^### (.*$)/gim, '<h4 class="text-white mt-4">$1</h4>')
        .replace(/^## (.*$)/gim, '<h3 class="text-white mt-6">$1</h3>')
        .replace(/^# (.*$)/gim, '<h2 class="text-white mt-8 mb-4">$1</h2>')
        .replace(/\\*\\*(.*)\\*\\*/gim, '<strong>$1</strong>')
        .replace(/\\*(.*)\\*/gim, '<em>$1</em>')
        .replace(/^\\> (.*$)/gim, '<blockquote class="border-l-4 border-white/20 pl-4 py-1 italic">$1</blockquote>')
        .replace(/\\n-(.*)/gim, '<ul><li class="ml-4 list-disc">$1</li></ul>')
        .replace(/\\n/gim, '<br />');
    
    html = html.replace(/<\\/ul><br \\/><ul>/gim, '');
    return html;
}
`;

content = content.substring(0, startIndex) + newComponent + '\n\n' + content.substring(endIndex);

if (!content.includes('import { Upload')) {
    content = content.replace("import { Search, List, Activity, Settings2,", "import { Search, List, Activity, Settings2, Upload, Percent,");
}

fs.writeFileSync(file, content, 'utf8');
console.log('Restructured BuilderTabContent with AI generation capability.');
