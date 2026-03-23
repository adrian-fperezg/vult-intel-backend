const fs = require('fs');
const file = './src/pages/WebGrowthPlan.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add Imports
if (!content.includes("import ReactMarkdown from 'react-markdown';")) {
    content = content.replace("import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect } from 'react';\nimport ReactMarkdown from 'react-markdown';");
}
if (!content.includes("import { exportToDoc, exportToCsv }")) {
    content = content.replace("import { generateLandingBlueprint, BlueprintData } from '@/services/ai';", "import { generateLandingBlueprint, BlueprintData } from '@/services/ai';\nimport { exportToDoc, exportToCsv } from '@/lib/exportUtils';");
}

/* 
  FIX 1: BuilderTabContent Text Rendering and Export  
*/
const builderExportSearch = `<button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/10 text-sm">
                        <Download className="size-4" /> Export Draft
                    </button>`;
const builderExportReplace = `<button onClick={() => {
                        let htmlStr = \`<h1>\${objective} - \${contentType}</h1><br/>\`;
                        auditData.blueprint.forEach(sec => {
                            htmlStr += \`<h2>\${sec.sectionName}</h2>\`;
                            htmlStr += \`<p>\${convertMarkdownToHtml(sec.copyBlocks)}</p><br/>\`;
                        });
                        exportToDoc(htmlStr, 'Landing_Blueprint');
                    }} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/10 text-sm">
                        <Download className="size-4" /> Export Draft (Docs)
                    </button>`;

content = content.replace(builderExportSearch, builderExportReplace);

const builderRenderSearch = `<div className="prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-headings:text-white prose-p:text-slate-300 prose-headings:tracking-tight prose-p:leading-relaxed prose-a:text-blue-400 bg-black/40 p-4 rounded-xl border border-white/5 whitespace-pre-wrap font-mono">
                                        {section.copyBlocks}
                                    </div>`;
const builderRenderReplace = `<div className="prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-headings:text-white prose-p:text-slate-300 prose-headings:tracking-tight prose-p:leading-relaxed prose-a:text-blue-400 bg-black/40 p-4 rounded-xl border border-white/5">
                                        <ReactMarkdown>{section.copyBlocks}</ReactMarkdown>
                                    </div>`;
content = content.replace(builderRenderSearch, builderRenderReplace);

/*
  FIX 2: ResearchTabContent Text Rendering and Export
*/
const keywordExportSearch = `<button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/10 text-sm">
                        <Download className="size-4" /> Export Data
                    </button>`;
const keywordExportReplace = `<button onClick={() => {
                        const rows = [
                            ['Keyword', 'Intent', 'Volume', 'Difficulty', 'Features', 'Content Type', 'Opportunity Note']
                        ];
                        keywordData.opportunities.forEach(opp => {
                            rows.push([
                                opp.keyword,
                                opp.intent,
                                opp.estimatedVolume,
                                opp.difficulty,
                                opp.serpFeatures.join(', '),
                                opp.suggestedContentType,
                                opp.opportunityNote
                            ]);
                        });
                        exportToCsv(rows, 'Keyword_Research');
                    }} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/10 text-sm">
                        <Download className="size-4" /> Export Data (Sheets)
                    </button>`;
content = content.replace(keywordExportSearch, keywordExportReplace);

/*
  FIX 3: Ensure Markdown fixes across the app (like SEO Audit Checklist)
  AuditTab uses basic strings, so we can let it be, but let's check its Export button.
*/
const auditExportSearch = `<button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/10 text-sm flex items-center gap-2">
                        <Download className="size-4" /> Export Checklist
                    </button>`;
const auditExportReplace = `<button onClick={() => {
                        const rows = [['Issue', 'Why It Matters', 'Recommended Fix', 'Impact', 'Effort', 'Affected Pages']];
                        auditData.prioritizedChecklist.forEach(item => {
                            rows.push([
                                item.issue,
                                item.whyItMatters,
                                item.recommendedFix,
                                item.impact,
                                item.effort,
                                item.affectedPages
                            ]);
                        });
                        exportToCsv(rows, 'SEO_Audit_Checklist');
                    }} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/10 text-sm flex items-center gap-2">
                        <Download className="size-4" /> Export Checklist (Sheets)
                    </button>`;
content = content.replace(auditExportSearch, auditExportReplace);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully patched markdown rendering and export functionalities.');
