import { useState, useEffect } from 'react';
import {
    LayoutGrid, Plus, Save, Trash2, ArrowRight, Settings,
    Mail, Users, Filter, Target, Zap, ChevronDown, Check, Loader2, Sparkles, Bot, X, Boxes
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getProjects, updateProject, Project, WorkflowDefinition, WorkflowField } from '@/services/scanService';
import { v4 as uuidv4 } from 'uuid';
import { logCustomEvent } from '@/services/analytics';
import { generateWorkflow } from '@/services/ai';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useUserMetrics } from '@/hooks/useUserMetrics';
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';

const BLUEPRINTS = [
    { id: 'sales-funnel', name: 'Sales Funnel', icon: Filter },
    { id: 'client-roadmap', name: 'Client Roadmap', icon: Users },
    { id: 'email-automation', name: 'Email Automation', icon: Mail },
    { id: 'marketing-sequence', name: 'Marketing Sequence', icon: Zap }
];

const DEFAULT_BLUEPRINT_FIELDS: Record<string, WorkflowField[]> = {
    'sales-funnel': [
        { id: uuidv4(), label: 'Traffic Source', value: 'Facebook Ads', type: 'text' },
        { id: uuidv4(), label: 'Landing/Opt-in Page', value: 'Free Lead Magnet', type: 'text' },
        { id: uuidv4(), label: 'Core Offer', value: '$97 Course', type: 'text' },
        { id: uuidv4(), label: 'Upsell', value: '$497 Coaching', type: 'text' },
        { id: uuidv4(), label: 'Thank You Page', value: 'Join FB Group', type: 'text' }
    ],
    'client-roadmap': [
        { id: uuidv4(), label: 'Lead Generation', value: 'Outbound Cold Email', type: 'text' },
        { id: uuidv4(), label: 'Discovery Call', value: '30 Min Qualification', type: 'text' },
        { id: uuidv4(), label: 'Proposal Sent', value: 'Standard Package', type: 'text' },
        { id: uuidv4(), label: 'Onboarding', value: 'Kickoff Call + Contract', type: 'text' },
        { id: uuidv4(), label: 'Core Delivery', value: 'First 30 Days Strategy', type: 'text' }
    ],
    'email-automation': [
        { id: uuidv4(), label: 'Trigger Event', value: 'Subscribed to Newsletter', type: 'text' },
        { id: uuidv4(), label: 'Email 1 (Immediate)', value: 'Welcome & Value Drop', type: 'text' },
        { id: uuidv4(), label: 'Wait Delay', value: '2 Days', type: 'text' },
        { id: uuidv4(), label: 'Email 2 (Nurture)', value: 'Case Study / Social Proof', type: 'text' },
        { id: uuidv4(), label: 'Call to Action', value: 'Book a Consultation', type: 'text' }
    ],
    'marketing-sequence': [
        { id: uuidv4(), label: 'Awareness Phase', value: 'TikTok Organic Posts', type: 'text' },
        { id: uuidv4(), label: 'Consideration Phase', value: 'Retargeting Ads', type: 'text' },
        { id: uuidv4(), label: 'Decision Phase', value: 'Limited Time Offer', type: 'text' },
        { id: uuidv4(), label: 'Retention Phase', value: 'Monthly VIP Newsletter', type: 'text' }
    ]
};

const INITIAL_CUSTOM_FIELDS: Record<string, WorkflowField[]> = {
    'sales-funnel': [
        { id: uuidv4(), label: 'Ad Budget ($)', value: '1000', type: 'number' },
        { id: uuidv4(), label: 'Target CPA ($)', value: '15', type: 'number' },
        { id: uuidv4(), label: 'Expected Conversion Rate (%)', value: '3', type: 'number' },
        { id: uuidv4(), label: 'Funnel Tech Stack', value: 'ClickFunnels, Stripe, Zapier', type: 'textarea' }
    ],
    'client-roadmap': [
        { id: uuidv4(), label: 'Deal Value (Avg)', value: '2500', type: 'number' },
        { id: uuidv4(), label: 'Closing Rate (%)', value: '20', type: 'number' },
        { id: uuidv4(), label: 'Onboarding Software', value: 'DocuSign, Notion', type: 'text' },
        { id: uuidv4(), label: 'Key Deliverables Summary', value: 'Audit, Strategy Deck, Setup', type: 'textarea' }
    ],
    'email-automation': [
        { id: uuidv4(), label: 'Target Open Rate (%)', value: '35', type: 'number' },
        { id: uuidv4(), label: 'Target CTR (%)', value: '5', type: 'number' },
        { id: uuidv4(), label: 'ESP / Platform', value: 'Mailchimp / ActiveCampaign', type: 'text' },
        { id: uuidv4(), label: 'Sequence Goal (Notes)', value: 'Educate users on the core problem and agitate pain points before pitching the solution in Email 4.', type: 'textarea' }
    ],
    'marketing-sequence': [
        { id: uuidv4(), label: 'Total Campaign Budget', value: '5000', type: 'number' },
        { id: uuidv4(), label: 'Primary KPI', value: 'ROAS', type: 'text' },
        { id: uuidv4(), label: 'Target ROAS', value: '3.5', type: 'number' },
        { id: uuidv4(), label: 'Creative Assets Required', value: '3x Videos, 5x Image Carousels, 1x Lead Magnet PDF', type: 'textarea' }
    ]
};

export default function Workflows() {
    const [project, setProject] = useState<Project | null>(null);
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
    const [isBlueprintMenuOpen, setIsBlueprintMenuOpen] = useState(false);

    const { currentUser } = useAuth();
    const { activeProject } = useProject();
    const { currentPlanId } = useUserMetrics();
    const isSoloPlan = currentPlanId === 'solo';

    const [promptText, setPromptText] = useState('');
    const [workflowType, setWorkflowType] = useState('Sales Funnel');
    const [isGenerating, setIsGenerating] = useState(false);

    // Custom field local states
    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldValue, setNewFieldValue] = useState('');
    const [newFieldType, setNewFieldType] = useState<'text' | 'textarea' | 'number'>('text');

    const [isSaving, setIsSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    useEffect(() => {
        let timer: any;
        if (toastMessage) {
            timer = setTimeout(() => setToastMessage(null), 3000);
        }
        return () => clearTimeout(timer);
    }, [toastMessage]);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            const projects = await getProjects();
            setAllProjects(projects);
            if (projects.length > 0) {
                setProject(projects[0]);
                if (projects[0].workflows && projects[0].workflows.length > 0) {
                    setActiveWorkflowId(projects[0].workflows[0].id);
                }
            }
            setIsLoading(false);
        };
        loadData();
    }, []);

    const handleCreateBlueprint = (blueprintId: string) => {
        if (!project) return;

        const bpDef = BLUEPRINTS.find(b => b.id === blueprintId);
        if (!bpDef) return;

        logCustomEvent('workflow_created', { blueprint: bpDef.name, project_id: project.id });

        // generate fresh field IDs to avoid references collision
        const freshFields = DEFAULT_BLUEPRINT_FIELDS[blueprintId].map(f => ({ ...f, id: uuidv4() }));

        // generate fresh custom fields tailored to the blueprint type
        const customFields = INITIAL_CUSTOM_FIELDS[blueprintId]
            ? INITIAL_CUSTOM_FIELDS[blueprintId].map(f => ({ ...f, id: uuidv4() }))
            : [];

        const newWorkflow: WorkflowDefinition = {
            id: uuidv4(),
            name: `New ${bpDef.name}`,
            type: blueprintId,
            fields: freshFields,
            customFields: customFields,
            updatedAt: new Date().toISOString()
        };

        const updatedWorkflows = [...(project.workflows || []), newWorkflow];
        const updatedProject = { ...project, workflows: updatedWorkflows };

        setProject(updatedProject);
        setActiveWorkflowId(newWorkflow.id);
        setIsBlueprintMenuOpen(false);
    };

    const handleGenerateWorkflow = async () => {
        if (!project || !promptText.trim()) return;

        setIsGenerating(true);
        try {
            logCustomEvent('workflow_ai_generated', { project_id: project.id });
            const finalPrompt = `Type: ${workflowType}. Details: ${promptText}`;
            const generated = await generateWorkflow(finalPrompt, currentUser?.uid, activeProject);

            const newWorkflow: WorkflowDefinition = {
                id: uuidv4(),
                name: generated.name || 'AI Generated Workflow',
                type: 'custom',
                fields: generated.fields.map(f => ({ ...f, id: uuidv4() })),
                customFields: generated.customFields.map(f => ({ ...f, id: uuidv4() })),
                updatedAt: new Date().toISOString()
            };

            const updatedWorkflows = [...(project.workflows || []), newWorkflow];
            const updatedProject = { ...project, workflows: updatedWorkflows };

            setProject(updatedProject);
            setActiveWorkflowId(newWorkflow.id);
            setPromptText('');
        } catch (error) {
            console.error(error);
            setToastMessage('Failed to generate workflow. Try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveProject = async () => {
        if (!project) return;
        setIsSaving(true);
        try {
            await updateProject(project);
            setToastMessage('Workflows saved successfully');
        } catch (e) {
            console.error(e);
            setToastMessage('Failed to save workflows');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteWorkflow = (wId: string) => {
        if (!project) return;
        const updatedWorkflows = project.workflows?.filter(w => w.id !== wId) || [];
        setProject({ ...project, workflows: updatedWorkflows });
        if (activeWorkflowId === wId) {
            setActiveWorkflowId(updatedWorkflows.length > 0 ? updatedWorkflows[0].id : null);
        }
    };

    const handleFieldChange = (fieldId: string, newValue: string, isCustom = false) => {
        if (!project || !activeWorkflowId) return;

        const workflows = [...(project.workflows || [])];
        const wIndex = workflows.findIndex(w => w.id === activeWorkflowId);
        if (wIndex === -1) return;

        const targetList = isCustom ? 'customFields' : 'fields';
        const fieldIndex = workflows[wIndex][targetList].findIndex(f => f.id === fieldId);

        if (fieldIndex !== -1) {
            workflows[wIndex][targetList][fieldIndex].value = newValue;
            workflows[wIndex].updatedAt = new Date().toISOString();
            setProject({ ...project, workflows });
        }
    };

    const handleNameChange = (newName: string) => {
        if (!project || !activeWorkflowId) return;
        const workflows = [...(project.workflows || [])];
        const wIndex = workflows.findIndex(w => w.id === activeWorkflowId);
        if (wIndex === -1) return;
        workflows[wIndex].name = newName;
        setProject({ ...project, workflows });
    };

    const handleAddCustomField = () => {
        if (!project || !activeWorkflowId || !newFieldName.trim()) return;

        const workflows = [...(project.workflows || [])];
        const wIndex = workflows.findIndex(w => w.id === activeWorkflowId);
        if (wIndex === -1) return;

        const newField: WorkflowField = {
            id: uuidv4(),
            label: newFieldName.trim(),
            value: newFieldValue.trim(),
            type: newFieldType
        };

        workflows[wIndex].customFields.push(newField);
        setProject({ ...project, workflows });

        setNewFieldName('');
        setNewFieldValue('');
        setNewFieldType('text');
    };

    const handleDeleteCustomField = (fieldId: string) => {
        if (!project || !activeWorkflowId) return;
        const workflows = [...(project.workflows || [])];
        const wIndex = workflows.findIndex(w => w.id === activeWorkflowId);
        if (wIndex === -1) return;

        workflows[wIndex].customFields = workflows[wIndex].customFields.filter(f => f.id !== fieldId);
        setProject({ ...project, workflows });
    };

    const handleAddCoreField = () => {
        if (!project || !activeWorkflowId) return;
        const workflows = [...(project.workflows || [])];
        const wIndex = workflows.findIndex(w => w.id === activeWorkflowId);
        if (wIndex === -1) return;

        workflows[wIndex].fields.push({
            id: uuidv4(),
            label: 'New Step',
            value: '',
            type: 'text'
        });
        setProject({ ...project, workflows });
    };

    const handleDeleteCoreField = (fieldId: string) => {
        if (!project || !activeWorkflowId) return;
        const workflows = [...(project.workflows || [])];
        const wIndex = workflows.findIndex(w => w.id === activeWorkflowId);
        if (wIndex === -1) return;

        workflows[wIndex].fields = workflows[wIndex].fields.filter(f => f.id !== fieldId);
        setProject({ ...project, workflows });
    };

    const handleLabelChange = (fieldId: string, newLabel: string, isCustom = false) => {
        if (!project || !activeWorkflowId) return;
        const workflows = [...(project.workflows || [])];
        const wIndex = workflows.findIndex(w => w.id === activeWorkflowId);
        if (wIndex === -1) return;

        const targetList = isCustom ? 'customFields' : 'fields';
        const fieldIndex = workflows[wIndex][targetList].findIndex(f => f.id === fieldId);

        if (fieldIndex !== -1) {
            workflows[wIndex][targetList][fieldIndex].label = newLabel;
            workflows[wIndex].updatedAt = new Date().toISOString();
            setProject({ ...project, workflows });
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-dark">
                <Loader2 className="size-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const activeWorkflow = project?.workflows?.find(w => w.id === activeWorkflowId);
    const totalNodes = activeWorkflow ? activeWorkflow.fields.length + activeWorkflow.customFields.length : 0;
    const isLimitReached = isSoloPlan && totalNodes >= 15;

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            {/* Page Action Bar (replaces the artificial sub-header) */}
            <div className="px-8 py-6 mb-2 border-b border-surface-border bg-background-dark shrink-0">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                                <Boxes className="size-6 text-indigo-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                                    Visual Workflows
                                </h1>
                                <p className="text-sm text-slate-400 mt-1">
                                    Design and manage your marketing automation sequences
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleSaveProject}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                        >
                            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                            {isSaving ? 'Saving...' : 'Save Workflows'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* Templates Sidebar */}
                <div className="w-80 shrink-0 border-r border-white/5 bg-surface-dark/40 flex flex-col overflow-hidden relative z-10 backdrop-blur-md">
                    <div className="p-6 border-b border-white/5">
                        <div className="relative">
                            <button
                                onClick={() => setIsBlueprintMenuOpen(!isBlueprintMenuOpen)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-colors shadow-none"
                            >
                                <Plus className="size-4" />
                                New Workflow Blueprint
                            </button>

                            {isBlueprintMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsBlueprintMenuOpen(false)} />
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface-dark border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden ring-1 ring-white/5">
                                        {BLUEPRINTS.map(bp => (
                                            <button
                                                key={bp.id}
                                                onClick={() => handleCreateBlueprint(bp.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm text-slate-300 hover:text-white flex items-center gap-3 border-b border-white/5 last:border-0 transition-colors"
                                            >
                                                <bp.icon className="size-4 text-blue-400" />
                                                {bp.name}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {!project?.workflows || project.workflows.length === 0 ? (
                            <div className="text-center p-6 border border-dashed border-white/10 rounded-xl">
                                <LayoutGrid className="size-8 text-slate-600 mx-auto mb-3" />
                                <p className="text-sm text-slate-400">No workflows yet.</p>
                                <p className="text-xs text-slate-500 mt-1">Create a blueprint to get started.</p>
                            </div>
                        ) : (
                            project.workflows.map(w => {
                                const bpDef = BLUEPRINTS.find(b => b.id === w.type);
                                const Icon = bpDef ? bpDef.icon : LayoutGrid;
                                const isActive = activeWorkflowId === w.id;
                                return (
                                    <button
                                        key={w.id}
                                        onClick={() => setActiveWorkflowId(w.id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-4 py-4 rounded-xl text-left transition-all border group",
                                            isActive
                                                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                                : "bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.05] hover:text-white"
                                        )}
                                    >
                                        <Icon className="size-5 shrink-0" />
                                        <div className="flex-1 overflow-hidden">
                                            <p className={cn("text-sm font-semibold truncate transition-colors", isActive ? "text-blue-300" : "text-slate-200")}>{w.name}</p>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{bpDef?.name || 'Custom'}</p>
                                        </div>
                                        {isActive && (
                                            <div
                                                onClick={(e) => { e.stopPropagation(); handleDeleteWorkflow(w.id); }}
                                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-all"
                                            >
                                                <Trash2 className="size-4" />
                                            </div>
                                        )}
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Main Workspace Area (Canvas placeholder) */}
                <div className="flex-1 overflow-y-auto bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-background-dark relative">

                    {/* Grid Pattern Background */}
                    <div className="absolute inset-0 z-0 bg-background-dark/90 backdrop-brightness-100 dark:backdrop-brightness-150" style={{
                        backgroundImage: 'radial-gradient(var(--tw-gradient-stops))',
                        backgroundSize: '24px 24px',
                        backgroundPosition: '0 0'
                    }}>
                        <div className="absolute inset-0 bg-background-dark/80" />
                    </div>
                    {activeWorkflow ? (
                        <div className="p-8 max-w-5xl mx-auto space-y-10 pb-32">

                            {/* Workflow Header Title */}
                            <div className="flex items-center gap-4 group">
                                <input
                                    type="text"
                                    value={activeWorkflow.name}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    className="text-4xl font-bold bg-transparent text-white border-b-2 border-transparent hover:border-white/10 focus:border-blue-500 focus:outline-none transition-colors w-full pb-1 relative z-10"
                                />
                            </div>

                            {/* Core Steps Visualization */}
                            <div className="relative z-10">
                                <h3 className="text-sm uppercase tracking-widest font-bold text-slate-500 mb-6 flex items-center gap-2">
                                    <Target className="size-4" /> Workflow Core Steps
                                </h3>

                                <div className="flex flex-wrap items-center gap-4">
                                    {activeWorkflow.fields.map((field, idx) => (
                                        <div key={field.id} className="flex items-center gap-4">
                                            <div className="bg-surface-dark border border-white/10 rounded-2xl p-5 min-w-[200px] shadow-xl hover:border-blue-500/30 transition-colors group relative backdrop-blur-sm">
                                                <button
                                                    onClick={() => handleDeleteCoreField(field.id)}
                                                    className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-all shadow-md"
                                                >
                                                    <X className="size-3" />
                                                </button>
                                                <input
                                                    type="text"
                                                    value={field.label}
                                                    onChange={(e) => handleLabelChange(field.id, e.target.value)}
                                                    className="text-xs uppercase tracking-wider font-bold text-blue-400 block mb-3 bg-transparent border-b border-transparent hover:border-blue-500/30 focus:border-blue-500 outline-none w-full transition-colors"
                                                    placeholder="Step Name"
                                                />
                                                <input
                                                    type={field.type === 'number' ? 'number' : 'text'}
                                                    value={field.value}
                                                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                                    className="w-full bg-black/20 text-white text-sm font-medium border border-transparent group-hover:border-white/10 focus:border-blue-500 py-2 px-3 rounded-lg outline-none transition-all placeholder:text-slate-500"
                                                    placeholder="Enter detail..."
                                                />
                                            </div>
                                            {idx < activeWorkflow.fields.length - 1 && (
                                                <ArrowRight className="size-6 text-slate-600 shrink-0" />
                                            )}
                                        </div>
                                    ))}

                                    {isLimitReached ? (
                                        <div className="h-[104px] px-6 border border-dashed border-amber-500/30 bg-amber-500/5 rounded-2xl flex flex-col items-center justify-center gap-1">
                                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest text-center">Límite 15 Nodos</span>
                                            <span className="text-[9px] text-slate-400 text-center font-bold uppercase">Plan Growth Requerido</span>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleAddCoreField}
                                            className="h-[104px] px-6 border-2 border-dashed border-white/10 text-slate-500 hover:text-white hover:border-white/20 hover:bg-white/5 rounded-2xl flex items-center justify-center gap-2 transition-all group"
                                        >
                                            <Plus className="size-5" />
                                            <span className="text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Add Step</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Contextual Configurable Params */}
                            <div className="pt-8 border-t border-white/10 relative z-10">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-sm uppercase tracking-widest font-bold text-slate-500 flex items-center gap-2">
                                        <Settings className="size-4" />
                                        {activeWorkflow.type === 'sales-funnel' && 'Funnel Economics & Tech Setup'}
                                        {activeWorkflow.type === 'client-roadmap' && 'Deal Metrics & Delivery Info'}
                                        {activeWorkflow.type === 'email-automation' && 'Campaign Goals & Logistics'}
                                        {activeWorkflow.type === 'marketing-sequence' && 'Campaign Budget & KPIs'}
                                        {!['sales-funnel', 'client-roadmap', 'email-automation', 'marketing-sequence'].includes(activeWorkflow.type) && 'Custom Workflow Properties'}
                                    </h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                                    {activeWorkflow.customFields.map((cf) => (
                                        <div key={cf.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col group relative">
                                            <button
                                                onClick={() => handleDeleteCustomField(cf.id)}
                                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-all"
                                            >
                                                <Trash2 className="size-3" />
                                            </button>
                                            <label className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block mb-2 max-w-[80%] truncate">
                                                {cf.label}
                                            </label>
                                            {cf.type === 'textarea' ? (
                                                <textarea
                                                    value={cf.value}
                                                    onChange={(e) => handleFieldChange(cf.id, e.target.value, true)}
                                                    className="w-full bg-black/30 text-slate-200 text-sm border border-transparent focus:border-white/20 py-2 px-3 rounded-lg outline-none transition-all resize-none h-20"
                                                />
                                            ) : (
                                                <input
                                                    type={cf.type === 'number' ? 'number' : 'text'}
                                                    value={cf.value}
                                                    onChange={(e) => handleFieldChange(cf.id, e.target.value, true)}
                                                    className="w-full bg-black/30 text-slate-200 text-sm border border-transparent focus:border-white/20 py-2 px-3 rounded-lg outline-none transition-all"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Add new fields form */}
                                <div className="bg-surface-dark/40 backdrop-blur-md border border-dashed border-white/20 rounded-xl p-5 mt-8">
                                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-4">Add Custom Field Parameter</h4>
                                    <div className="flex flex-col md:flex-row items-end gap-4">
                                        <div className="w-full md:w-1/3">
                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Field Label</label>
                                            <input
                                                type="text"
                                                value={newFieldName}
                                                onChange={(e) => setNewFieldName(e.target.value)}
                                                placeholder="e.g. Budget per Lead"
                                                className="w-full bg-black/20 text-white text-sm border border-white/10 focus:border-blue-500 py-2.5 px-3 rounded-lg outline-none"
                                            />
                                        </div>
                                        <div className="w-full md:w-1/3">
                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Initial Value</label>
                                            <input
                                                type="text"
                                                value={newFieldValue}
                                                onChange={(e) => setNewFieldValue(e.target.value)}
                                                placeholder="e.g. $10"
                                                className="w-full bg-black/20 text-white text-sm border border-white/10 focus:border-blue-500 py-2.5 px-3 rounded-lg outline-none"
                                            />
                                        </div>
                                        <div className="w-full md:w-auto">
                                            <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Type</label>
                                            <select
                                                value={newFieldType}
                                                onChange={(e) => setNewFieldType(e.target.value as any)}
                                                className="w-full bg-surface-dark text-white text-sm border border-white/10 focus:border-blue-500 py-2.5 px-3 rounded-lg outline-none min-w-[120px]"
                                            >
                                                <option value="text">Label / Text</option>
                                                <option value="number">Number</option>
                                                <option value="textarea">Paragraph</option>
                                            </select>
                                        </div>
                                        <button
                                            onClick={handleAddCustomField}
                                            disabled={!newFieldName.trim() || isLimitReached}
                                            className="w-full md:w-auto px-6 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white text-sm font-medium rounded-lg border border-white/10 transition-all"
                                        >
                                            {isLimitReached ? "Límite Alcanzado (15)" : "Add Field"}
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full p-8 max-w-2xl mx-auto relative z-10">
                            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 ring-1 ring-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                                <Bot className="size-8 text-blue-400" />
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-3 tracking-tight text-center">Design a Workflow with AI</h2>
                            <p className="text-slate-400 text-center mb-10 text-lg">
                                Describe the sequence, funnel, or automation you want to build. Vult Intel will architect the node map and configuration parameters instantly.
                            </p>

                            <div className="w-full bg-surface-dark border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden group focus-within:border-blue-400 transition-colors text-left backdrop-blur-sm">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />

                                <div className="mb-4 relative z-10">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">Workflow Type</label>
                                    <select
                                        value={workflowType}
                                        onChange={(e) => setWorkflowType(e.target.value)}
                                        className="w-full bg-black/40 text-white text-sm border border-white/10 focus:border-blue-500 py-2.5 px-3 rounded-xl outline-none transition-all cursor-pointer appearance-none font-medium"
                                    >
                                        <option value="Sales Funnel">Sales Funnel</option>
                                        <option value="Client Roadmap">Client Roadmap</option>
                                        <option value="Email Automation">Email Automation</option>
                                        <option value="Marketing Sequence">Marketing Sequence</option>
                                        <option value="Custom Operational Loop">Custom / Other</option>
                                    </select>
                                </div>

                                <div className="relative z-10">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">Prompt Details</label>
                                    <textarea
                                        value={promptText}
                                        onChange={(e) => setPromptText(e.target.value)}
                                        placeholder="e.g. Build a high-ticket coaching funnel starting from Facebook Ads, going to a VSL, then a calendar booking page, and finishing with an onboarding email sequence."
                                        className="w-full h-24 bg-transparent text-white placeholder:text-slate-600 resize-none outline-none text-base"
                                    />
                                </div>

                                <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5 relative z-10">
                                    <div className="text-xs text-slate-500 font-medium">
                                        Powered by Gemini 2.5 Flash
                                    </div>
                                    <button
                                        onClick={handleGenerateWorkflow}
                                        disabled={isGenerating || !promptText.trim()}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
                                    >
                                        {isGenerating ? (
                                            <>
                                                <Loader2 className="size-4 animate-spin" />
                                                Architecting...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="size-4" />
                                                Generate Workflow
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-8 text-center flex items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                                <span className="h-px w-8 bg-slate-200 dark:bg-white/10" />
                                Or select a blueprint from the sidebar
                                <span className="h-px w-8 bg-slate-200 dark:bg-white/10" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {toastMessage && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-slate-800 dark:bg-slate-900 border border-slate-700 dark:border-white/10 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 text-white">
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium">{toastMessage}</span>
                </div>
            )}
        </div>
    );
}
