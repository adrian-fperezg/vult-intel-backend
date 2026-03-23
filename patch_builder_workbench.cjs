const fs = require('fs');
const file = './src/pages/WebGrowthPlan.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
if (!content.includes('import { saveLandingBlueprint')) {
    content = content.replace(
        "import { getSeoAudits, deleteSeoAudit, SavedSeoAudit } from '@/services/seoAuditService';",
        "import { getSeoAudits, deleteSeoAudit, SavedSeoAudit } from '@/services/seoAuditService';\nimport { getLandingBlueprints, deleteLandingBlueprint, saveLandingBlueprint, SavedLandingBlueprint } from '@/services/landingBuilderService';\nimport { generateLandingBlueprint, BlueprintData } from '@/services/ai';"
    );
}

// 2. loadedBlueprint state
if (!content.includes('const [loadedBlueprint,')) {
    content = content.replace(
        "const [loadedAudit, setLoadedAudit] = useState<SavedSeoAudit | null>(null);",
        "const [loadedAudit, setLoadedAudit] = useState<SavedSeoAudit | null>(null);\n    const [loadedBlueprint, setLoadedBlueprint] = useState<SavedLandingBlueprint | null>(null);"
    );
}

// 3. SavedItems mapping
if (!content.includes('const blueprints = await getLandingBlueprints')) {
    const qtarget = `                const [researches, audits] = await Promise.all([
                    getKeywordResearches(projects[0].id),
                    getSeoAudits(projects[0].id)
                ]);
                const items = [
                    ...researches.map(r => ({ id: r.id, type: 'Keyword Scan', title: r.seedKeyword, data: r, createdAt: r.createdAt })),
                    ...audits.map(a => ({ id: a.id, type: 'SEO Audit', title: a.canonicalUrl, data: a, createdAt: a.createdAt }))
                ].sort((a, b) => b.createdAt - a.createdAt);`;
    const qrepl = `                const [researches, audits, blueprints] = await Promise.all([
                    getKeywordResearches(projects[0].id),
                    getSeoAudits(projects[0].id),
                    getLandingBlueprints(projects[0].id)
                ]);
                const items = [
                    ...researches.map(r => ({ id: r.id, type: 'Keyword Scan', title: r.seedKeyword, data: r, createdAt: r.createdAt })),
                    ...audits.map(a => ({ id: a.id, type: 'SEO Audit', title: a.canonicalUrl, data: a, createdAt: a.createdAt })),
                    ...blueprints.map(b => ({ id: b.id, type: 'Landing Blueprint', title: \`\${b.objective} \${b.contentType}\`, data: b, createdAt: b.createdAt }))
                ].sort((a, b) => b.createdAt - a.createdAt);`;
    content = content.replace(qtarget, qrepl);
}

// 4. handleDeleteSavedItem
if (!content.includes('await deleteLandingBlueprint')) {
    const delTarget = `        if (project) {
            if (type === 'Keyword Scan') await deleteKeywordResearch(project.id, id);
            if (type === 'SEO Audit') await deleteSeoAudit(project.id, id);
        }`;
    const delRepl = `        if (project) {
            if (type === 'Keyword Scan') await deleteKeywordResearch(project.id, id);
            if (type === 'SEO Audit') await deleteSeoAudit(project.id, id);
            if (type === 'Landing Blueprint') await deleteLandingBlueprint(project.id, id);
        }`;
    content = content.replace(delTarget, delRepl);
}

// 5. Workbench click handler
if (!content.includes("setLoadedBlueprint(item.data as SavedLandingBlueprint)")) {
    const clickTarget = `                            onClick={() => { 
                                setActiveTab(item.type === 'Keyword Scan' ? 'research' : 'audit'); 
                                if (item.type === 'Keyword Scan') {
                                    setLoadedResearch(item.data as SavedKeywordResearch);
                                    setLoadedAudit(null);
                                } else {
                                    setLoadedAudit(item.data as SavedSeoAudit);
                                    setLoadedResearch(null);
                                }
                            }}`;
    const clickRepl = `                            onClick={() => { 
                                if (item.type === 'Keyword Scan') {
                                    setActiveTab('research');
                                    setLoadedResearch(item.data as SavedKeywordResearch);
                                    setLoadedAudit(null);
                                    setLoadedBlueprint(null);
                                } else if (item.type === 'SEO Audit') {
                                    setActiveTab('audit');
                                    setLoadedAudit(item.data as SavedSeoAudit);
                                    setLoadedResearch(null);
                                    setLoadedBlueprint(null);
                                } else if (item.type === 'Landing Blueprint') {
                                    setActiveTab('builder');
                                    setLoadedBlueprint(item.data as SavedLandingBlueprint);
                                    setLoadedResearch(null);
                                    setLoadedAudit(null);
                                }
                            }}`;
    content = content.replace(clickTarget, clickRepl);
}

// 6. Pass to BuilderTabContent
content = content.replace(
    "<BuilderTabContent projectId={project?.id} />",
    "<BuilderTabContent projectId={project?.id} loadedBlueprint={loadedBlueprint} onSaveItem={(item) => setSavedItems(prev => [item, ...prev].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))} />"
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched Builder global workbench successfully.');
