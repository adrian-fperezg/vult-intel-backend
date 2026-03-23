const fs = require('fs');
const file = './src/pages/WebGrowthPlan.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
if (!content.includes('import { saveSeoAudit')) {
    content = content.replace(
        "import { saveKeywordResearch, getKeywordResearches, deleteKeywordResearch, SavedKeywordResearch } from '@/services/keywordResearchService';",
        "import { saveKeywordResearch, getKeywordResearches, deleteKeywordResearch, SavedKeywordResearch } from '@/services/keywordResearchService';\nimport { getSeoAudits, deleteSeoAudit, SavedSeoAudit } from '@/services/seoAuditService';"
    );
}

// 2. loadedAudit state
if (!content.includes('const [loadedAudit,')) {
    content = content.replace(
        "const [loadedResearch, setLoadedResearch] = useState<SavedKeywordResearch | null>(null);",
        "const [loadedResearch, setLoadedResearch] = useState<SavedKeywordResearch | null>(null);\n    const [loadedAudit, setLoadedAudit] = useState<SavedSeoAudit | null>(null);"
    );
}

// 3. SavedItems mapping
if (!content.includes('const audits = await getSeoAudits')) {
    const qtarget = `                const researches = await getKeywordResearches(projects[0].id);
                setSavedItems(researches.map(r => ({
                    id: r.id,
                    type: 'Keyword Scan',
                    title: r.seedKeyword,
                    data: r
                })));`;
    const qrepl = `                const [researches, audits] = await Promise.all([
                    getKeywordResearches(projects[0].id),
                    getSeoAudits(projects[0].id)
                ]);
                const items = [
                    ...researches.map(r => ({ id: r.id, type: 'Keyword Scan', title: r.seedKeyword, data: r, createdAt: r.createdAt })),
                    ...audits.map(a => ({ id: a.id, type: 'SEO Audit', title: a.canonicalUrl, data: a, createdAt: a.createdAt }))
                ].sort((a, b) => b.createdAt - a.createdAt);
                setSavedItems(items);`;
    content = content.replace(qtarget, qrepl);
}

// 4. handleDeleteSavedItem
if (!content.includes('await deleteSeoAudit')) {
    const delTarget = `    const handleDeleteSavedItem = async (id: string, type: string) => {
        if (type === 'Keyword Scan' && project) {
            await deleteKeywordResearch(project.id, id);
        }
        setSavedItems(prev => prev.filter(item => item.id !== id));
    };`;
    const delRepl = `    const handleDeleteSavedItem = async (id: string, type: string) => {
        if (project) {
            if (type === 'Keyword Scan') await deleteKeywordResearch(project.id, id);
            if (type === 'SEO Audit') await deleteSeoAudit(project.id, id);
        }
        setSavedItems(prev => prev.filter(item => item.id !== id));
    };`;
    content = content.replace(delTarget, delRepl);
}

// 5. AuditTabContent loadedAudit prop
if (!content.includes('function AuditTabContent({ projectId, loadedAudit }')) {
    content = content.replace(
        "function AuditTabContent({ projectId }: { projectId?: string }) {",
        "function AuditTabContent({ projectId, loadedAudit }: { projectId?: string, loadedAudit?: SavedSeoAudit | null }) {"
    );
    
    // Add useEffect to loadedAudit to sync to ui state
    const targetState = `    const [auditData, setAuditData] = useState<any>(null); // Type imported locally to avoid circular dep issues in this script for now, but will fix later`;
    const targetStateRepl = `    const [auditData, setAuditData] = useState<any>(null); // Type imported locally to avoid circular dep issues in this script for now, but will fix later

    useEffect(() => {
        if (loadedAudit) {
            setCanonicalUrl(loadedAudit.canonicalUrl);
            setCompetitors(loadedAudit.competitors);
            setFocusPages(loadedAudit.focusPages);
            setGoal(loadedAudit.goal);
            setAuditData(loadedAudit.data);
        }
    }, [loadedAudit]);`;
    content = content.replace(targetState, targetStateRepl);
}

// 6. Passing props down to AuditTabContent and handling click
content = content.replace(
    "<AuditTabContent projectId={project?.id} />",
    "<AuditTabContent projectId={project?.id} loadedAudit={loadedAudit} />"
);

// We still need to handle the workbench click. Let's find:
// onClick={() => { setActiveTab(item.type === 'Keyword Scan' ? 'research' : 'audit'); setLoadedResearch(item.data as SavedKeywordResearch); }}
if (content.includes("setLoadedResearch(item.data as SavedKeywordResearch);")) {
    const clickTarget = `onClick={() => { setActiveTab(item.type === 'Keyword Scan' ? 'research' : 'audit'); setLoadedResearch(item.data as SavedKeywordResearch); }}`;
    const clickRepl = `onClick={() => { 
                                setActiveTab(item.type === 'Keyword Scan' ? 'research' : 'audit'); 
                                if (item.type === 'Keyword Scan') {
                                    setLoadedResearch(item.data as SavedKeywordResearch);
                                    setLoadedAudit(null);
                                } else {
                                    setLoadedAudit(item.data as SavedSeoAudit);
                                    setLoadedResearch(null);
                                }
                            }}`;
    content = content.replace(clickTarget, clickRepl);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Patched global workbench successfully.');
