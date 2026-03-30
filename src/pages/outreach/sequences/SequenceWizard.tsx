import React, { useState } from 'react';
import { 
  Settings, Mail, Users, Search, 
  Upload, ChevronRight, ChevronLeft, Loader2,
  Clock, GitBranch, Plus, Trash2, X, CheckCircle2
} from 'lucide-react';
import { TealButton } from '../OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import { cn } from '@/lib/utils';
import TipTapEditor from '../components/TipTapEditor';

interface SequenceWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type WizardStep = 'settings' | 'logic' | 'contacts' | 'scheduling' | 'review';

export type SequenceNodeType = 'email' | 'delay' | 'condition' | 'task';

export interface SequenceNode {
  id: string;
  type: SequenceNodeType;
  // Email props
  subject?: string;
  body_html?: string;
  // Delay props
  delayDays?: number;
  label?: string;
  // Condition props
  conditionType?: 'opened' | 'clicked' | 'replied' | 'title' | 'visited';
  conditionValue?: string;
  trueBranch?: SequenceNode[];
  falseBranch?: SequenceNode[];
}

export default function SequenceWizard({ isOpen, onClose, onComplete }: SequenceWizardProps) {
  const api = useOutreachApi();
   const [step, setStep] = useState<WizardStep>('settings');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // 1. Settings
  const [name, setName] = useState('');

  // 2. Logic & Content
  const [nodes, setNodes] = useState<SequenceNode[]>([
    { id: '1', type: 'email', subject: 'Initial Outreach', body_html: '<p>Hi {{first_name}},</p>' }
  ]);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  // 3. Contacts
  const [contacts, setContacts] = useState<any[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // 4. Scheduling
  const [scheduling, setScheduling] = useState({
    daily_limit: 50,
    min_delay: 2,
    max_delay: 5,
    send_weekends: false,
  });

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length > 0) {
          setCsvPreview(rows.slice(0, 5));
          const headers = rows[0];
          const mapping: Record<string, string> = {};
          headers.forEach((h) => {
            const lower = h.toLowerCase();
            if (lower.includes('email')) mapping['email'] = h;
            if (lower.includes('first')) mapping['first_name'] = h;
            if (lower.includes('last')) mapping['last_name'] = h;
            if (lower.includes('company')) mapping['company'] = h;
          });
          setColumnMapping(mapping);
          
          const allContacts = rows.slice(1).map(row => {
            const obj: any = {};
            headers.forEach((h, i) => obj[h] = row[i]);
            return obj;
          }).filter(c => c[mapping['email']]);
          setContacts(allContacts);
        }
      },
      header: false,
    });
  };

  const handleLaunch = async () => {
    setIsSubmitting(true);
    try {
      // Create sequence template
      const seq = await api.createSequence(name || 'New Sequence', nodes);
      
      // Call custom launch API via hook helper
      await api.launchSequence(seq.id, {
        name: name || 'New Sequence',
        steps: nodes,
        contacts,
        columnMapping,
        scheduling
      });
      
      toast.success('Sequence launched successfully!');
      onComplete();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to launch sequence');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOptimizeNode = async (nodeId: string, parentArray: SequenceNode[], setParentArray: (arr: SequenceNode[]) => void) => {
    const node = parentArray.find(n => n.id === nodeId);
    if (!node || !node.body_html || node.body_html.length < 20) {
      toast.error('Please write some content first.');
      return;
    }
    
    setIsOptimizing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_OUTREACH_API_URL || ''}/api/outreach/ai/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: node.body_html,
          subject: node.subject
        }),
      });
      if (!response.ok) throw new Error('Failed to optimize');
      const data = await response.json();
      
      updateNode(nodeId, { body_html: data.optimizedContent }, parentArray, setParentArray);
      toast.success('Optimized with Gemini!');
    } catch (err) {
      console.error(err);
      toast.error('AI Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  const addNode = (type: SequenceNodeType, parentArray: SequenceNode[], setParentArray: (arr: SequenceNode[]) => void) => {
    const newNode: SequenceNode = { id: Math.random().toString(36).substr(2, 9), type };
    if (type === 'delay') newNode.delayDays = 2;
    if (type === 'condition') {
      newNode.conditionType = 'opened';
      newNode.trueBranch = [];
      newNode.falseBranch = [];
    }
    if (type === 'email') {
      newNode.subject = 'Follow up';
      newNode.body_html = '<p></p>';
    }
    setParentArray([...parentArray, newNode]);
  };

  const updateNode = (id: string, updates: Partial<SequenceNode>, parentArray: SequenceNode[], setParentArray: (arr: SequenceNode[]) => void) => {
    setParentArray(parentArray.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const removeNode = (id: string, parentArray: SequenceNode[], setParentArray: (arr: SequenceNode[]) => void) => {
    setParentArray(parentArray.filter(n => n.id !== id));
  };

  const renderNode = (node: SequenceNode, index: number, parentArray: SequenceNode[], setParentArray: (arr: SequenceNode[]) => void) => {
    const isEditing = editingNodeId === node.id;
    
    return (
      <div key={node.id} className="relative">
        {index > 0 && <div className="w-px h-6 bg-white/10 mx-auto" />}
        
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 overflow-hidden relative group">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 bg-white/5 px-2 py-1 rounded-md uppercase tracking-wider">
                {node.type}
              </span>
              {node.type === 'delay' && <span className="text-sm font-semibold text-white">Wait {node.delayDays} days</span>}
              {node.type === 'condition' && <span className="text-sm font-semibold text-white">If {node.conditionType}</span>}
              {node.type === 'email' && <span className="text-sm font-semibold text-white">{node.subject}</span>}
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditingNodeId(isEditing ? null : node.id)} className="text-xs text-teal-400 hover:text-teal-300">
                {isEditing ? 'Done' : 'Edit'}
              </button>
              <button onClick={() => removeNode(node.id, parentArray, setParentArray)} className="text-xs text-red-400 hover:text-red-300">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>

          {/* Edit Mode Panel */}
          {isEditing && (
            <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
              {node.type === 'delay' && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Days to wait</label>
                  <input type="number" value={node.delayDays} onChange={e => updateNode(node.id, { delayDays: Number(e.target.value) }, parentArray, setParentArray)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white w-32" />
                </div>
              )}
              {node.type === 'condition' && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Condition Type</label>
                  <select value={node.conditionType} onChange={e => updateNode(node.id, { conditionType: e.target.value as any }, parentArray, setParentArray)} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white w-full">
                    <option value="opened">Email was Opened</option>
                    <option value="clicked">Link was Clicked</option>
                    <option value="replied">Reply Received</option>
                    <option value="title">Job Title contains...</option>
                    <option value="visited">Visited Pricing Page</option>
                  </select>
                </div>
              )}
              {node.type === 'email' && (
                <div className="space-y-3">
                  <input 
                    type="text" 
                    placeholder="Subject line" 
                    value={node.subject} 
                    onChange={e => updateNode(node.id, { subject: e.target.value }, parentArray, setParentArray)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
                  />
                   <TipTapEditor 
                    value={node.body_html || ''}
                    onChange={(b) => updateNode(node.id, { body_html: b }, parentArray, setParentArray)}
                    onOptimize={() => handleOptimizeNode(node.id, parentArray, setParentArray)}
                    isOptimizing={isOptimizing}
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Branching UI for Condition */}
          {node.type === 'condition' && (
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5">
              {/* True Branch */}
              <div className="border border-green-500/20 bg-green-500/5 rounded-xl p-3">
                <p className="text-xs font-bold text-green-400 mb-3 flex items-center gap-1"><GitBranch className="size-3"/> Yes branch</p>
                {node.trueBranch?.map((child, i) => renderNode(child, i, node.trueBranch!, (arr) => updateNode(node.id, { trueBranch: arr }, parentArray, setParentArray)))}
                <button onClick={() => addNode('email', node.trueBranch!, (arr) => updateNode(node.id, { trueBranch: arr }, parentArray, setParentArray))} className="mt-3 w-full py-2 text-xs text-slate-400 hover:text-white border border-dashed border-white/20 rounded-lg flex items-center justify-center gap-1 hover:bg-white/5">
                  <Plus className="size-3" /> Add Step
                </button>
              </div>
              
              {/* False Branch */}
              <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-3">
                <p className="text-xs font-bold text-red-400 mb-3 flex items-center gap-1"><GitBranch className="size-3"/> No branch</p>
                {node.falseBranch?.map((child, i) => renderNode(child, i, node.falseBranch!, (arr) => updateNode(node.id, { falseBranch: arr }, parentArray, setParentArray)))}
                <button onClick={() => addNode('email', node.falseBranch!, (arr) => updateNode(node.id, { falseBranch: arr }, parentArray, setParentArray))} className="mt-3 w-full py-2 text-xs text-slate-400 hover:text-white border border-dashed border-white/20 rounded-lg flex items-center justify-center gap-1 hover:bg-white/5">
                  <Plus className="size-3" /> Add Step
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const stepsHeader = [
    { key: 'settings', label: 'Settings', icon: <Settings className="size-4" /> },
    { key: 'logic', label: 'Logic & Content', icon: <GitBranch className="size-4" /> },
    { key: 'contacts', label: 'Contacts', icon: <Users className="size-4" /> },
    { key: 'scheduling', label: 'Scheduling', icon: <Clock className="size-4" /> },
    { key: 'review', label: 'Review', icon: <Search className="size-4" /> },
  ];

  const deliveryEstimate = contacts.length > 0 
    ? (Math.ceil(contacts.length / scheduling.daily_limit) <= 1 ? "within 24 hours" : `approximately ${Math.ceil(contacts.length / scheduling.daily_limit)} days`)
    : "loading...";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative bg-[#0d1117] border border-white/10 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-8 py-6 border-b border-white/5 flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">Create Sequence</h2>
            <div className="flex items-center gap-2">
              {stepsHeader.map((s, idx) => (
                <React.Fragment key={s.key}>
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold select-none transition-colors",
                    step === s.key ? "bg-teal-500/20 text-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.2)]" : 
                    "text-slate-500"
                  )}>
                    {s.icon} {s.label}
                  </div>
                  {idx < stepsHeader.length - 1 && <ChevronRight className="size-3 text-slate-700" />}
                </React.Fragment>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          
          {step === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Sequence Settings</h3>
                <p className="text-slate-400">Give your sequence a name.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Sequence Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Q3 Cold Outreach"
                    className="w-full bg-[#161b22] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500/50"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'logic' && (
            <div className="max-w-4xl mx-auto space-y-8 pb-32">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Logic & Content</h3>
                <p className="text-slate-400">Build your sequence branching logic and write your email content.</p>
              </div>
              
              <div className="bg-[#161b22] border border-white/5 rounded-2xl p-6 shadow-inner">
                {nodes.map((node, i) => renderNode(node, i, nodes, setNodes))}
                
                <div className="mt-8 flex items-center justify-center gap-4">
                  <button onClick={() => addNode('delay', nodes, setNodes)} className="px-4 py-2 border border-white/10 bg-white/5 text-slate-300 rounded-lg text-sm hover:text-white hover:bg-white/10 transition flex items-center gap-2">
                    <Clock className="size-4" /> Add Delay
                  </button>
                  <button onClick={() => addNode('email', nodes, setNodes)} className="px-4 py-2 border border-white/10 bg-white/5 text-slate-300 rounded-lg text-sm hover:text-white hover:bg-white/10 transition flex items-center gap-2">
                    <Mail className="size-4" /> Add Email
                  </button>
                  <button onClick={() => addNode('condition', nodes, setNodes)} className="px-4 py-2 border border-blue-500/20 bg-blue-500/10 text-blue-400 rounded-lg text-sm hover:bg-blue-500/20 transition flex items-center gap-2">
                    <GitBranch className="size-4" /> Add Condition
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'contacts' && (
            <div className="max-w-3xl mx-auto space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Upload Recipients</h3>
                <p className="text-slate-400">Upload a CSV file with your contact list.</p>
              </div>

              {!contacts.length ? (
                <div className="border-2 border-dashed border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 bg-[#161b22] hover:bg-white/[0.02] hover:border-teal-500/30 transition-all text-center">
                  <div className="relative">
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="bg-teal-500/10 text-teal-400 rounded-full p-4 mb-2 inline-block">
                      <Upload className="size-8" />
                    </div>
                    <p className="text-lg font-bold text-white">Click to upload CSV</p>
                    <p className="text-sm text-slate-400 mt-1">Make sure you have an "email" column</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-teal-500/10 border border-teal-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-6 text-teal-400" />
                      <div>
                        <h4 className="font-bold text-teal-400">Successfully imported</h4>
                        <p className="text-sm text-teal-500/70">{contacts.length} leads loaded</p>
                      </div>
                    </div>
                    <button onClick={() => setContacts([])} className="text-sm text-slate-400 hover:text-white underline">Upload different file</button>
                  </div>

                  <div className="bg-[#161b22] border border-white/5 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-white/5 font-semibold text-white">Column Mapping (Auto-detected)</div>
                    <div className="p-4 grid gap-4 grid-cols-2">
                      <div className="space-y-1"><label className="text-xs text-slate-500">Email Address</label><div className="bg-black/30 p-2 rounded text-sm text-slate-300">{columnMapping['email'] || 'Not found'}</div></div>
                      <div className="space-y-1"><label className="text-xs text-slate-500">First Name</label><div className="bg-black/30 p-2 rounded text-sm text-slate-300">{columnMapping['first_name'] || 'Not found'}</div></div>
                      <div className="space-y-1"><label className="text-xs text-slate-500">Last Name</label><div className="bg-black/30 p-2 rounded text-sm text-slate-300">{columnMapping['last_name'] || 'Not found'}</div></div>
                      <div className="space-y-1"><label className="text-xs text-slate-500">Company</label><div className="bg-black/30 p-2 rounded text-sm text-slate-300">{columnMapping['company'] || 'Not found'}</div></div>
                    </div>
                  </div>

                  <div className="bg-[#161b22] border border-white/5 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-white/5 font-semibold text-white">Data Preview</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-white/5 text-slate-400">
                          <tr>{csvPreview[0]?.map((h, i) => <th key={i} className="p-3 font-semibold">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {csvPreview.slice(1).map((row, i) => (
                            <tr key={i} className="text-slate-300 hover:bg-white/[0.02]">
                              {row.map((cell, j) => <td key={j} className="p-3">{cell}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'scheduling' && (
            <div className="max-w-2xl mx-auto space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Smart Send Settings</h3>
                <p className="text-slate-400">Configure how and when your sequence emails are sent to maximize deliverability.</p>
              </div>

              <div className="bg-[#161b22] border border-white/5 rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between pb-6 border-b border-white/5">
                  <div>
                    <h4 className="font-bold text-white">Daily Limits</h4>
                    <p className="text-sm text-slate-400">Max emails to send per day to avoid spam filters</p>
                  </div>
                  <input type="number" value={scheduling.daily_limit} onChange={e => setScheduling({...scheduling, daily_limit: Number(e.target.value)})} className="bg-black/40 border border-white/10 rounded-lg w-24 px-3 py-2 text-white text-center" />
                </div>
                
                <div className="flex items-center justify-between pb-6 border-b border-white/5">
                  <div>
                    <h4 className="font-bold text-white">Randomized Delay (Minutes)</h4>
                    <p className="text-sm text-slate-400">Wait between emails to mimic human behavior</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" value={scheduling.min_delay} onChange={e => setScheduling({...scheduling, min_delay: Number(e.target.value)})} className="bg-black/40 border border-white/10 rounded-lg w-16 px-2 py-2 text-white text-center" />
                    <span className="text-slate-500">to</span>
                    <input type="number" value={scheduling.max_delay} onChange={e => setScheduling({...scheduling, max_delay: Number(e.target.value)})} className="bg-black/40 border border-white/10 rounded-lg w-16 px-2 py-2 text-white text-center" />
                  </div>
                </div>

                <div className="flex items-center justify-between pb-2">
                  <div>
                    <h4 className="font-bold text-white">Send on weekends?</h4>
                    <p className="text-sm text-slate-400">Include Saturday and Sunday in your sending windows</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={scheduling.send_weekends} onChange={e => setScheduling({...scheduling, send_weekends: e.target.checked})} className="sr-only peer" />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                  </label>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex gap-4">
                <Search className="size-6 text-blue-400 shrink-0" />
                <div>
                  <h4 className="font-bold text-blue-400 mb-1">Delivery Estimate</h4>
                  <p className="text-sm text-blue-300/80 mb-3">Based on your {scheduling.daily_limit}/day limit and {contacts.length} recipients.</p>
                  <p className="text-xl font-black text-white">{deliveryEstimate}</p>
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="max-w-3xl mx-auto space-y-8">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Review & Launch</h3>
                <p className="text-slate-400">Verify all details before activating this sequence.</p>
              </div>

              <div className="grid gap-6">
                <div className="bg-[#161b22] border border-white/5 rounded-2xl p-6 flex justify-between">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Sequence Name</p>
                    <p className="text-lg font-bold text-white">{name || 'New Sequence'}</p>
                  </div>
                  <button onClick={() => setStep('settings')} className="text-teal-400 text-sm hover:underline">Edit</button>
                </div>

                <div className="bg-[#161b22] border border-white/5 rounded-2xl p-6 flex justify-between">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Logic & Content</p>
                    <p className="text-lg font-bold text-white">{nodes.length > 0 ? `${nodes.length} nodes configured` : 'No steps added'}</p>
                  </div>
                  <button onClick={() => setStep('logic')} className="text-teal-400 text-sm hover:underline">Edit</button>
                </div>

                <div className="bg-[#161b22] border border-white/5 rounded-2xl p-6 flex justify-between">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Recipients</p>
                    <p className="text-lg font-bold text-white">{contacts.length} ready to enroll</p>
                  </div>
                  <button onClick={() => setStep('contacts')} className="text-teal-400 text-sm hover:underline">Edit</button>
                </div>
                
                <div className="bg-[#161b22] border border-white/5 rounded-2xl p-6 flex justify-between">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Sending Speed</p>
                    <p className="text-lg font-bold text-white">{scheduling.daily_limit} emails / day</p>
                    <p className="text-sm text-slate-400">{deliveryEstimate}</p>
                  </div>
                  <button onClick={() => setStep('scheduling')} className="text-teal-400 text-sm hover:underline">Edit</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-8 py-5 border-t border-white/5 bg-[#161b22] flex items-center justify-between">
          <div>
             {step !== 'settings' && (
               <button onClick={() => {
                 if (step === 'logic') setStep('settings');
                 if (step === 'contacts') setStep('logic');
                 if (step === 'scheduling') setStep('contacts');
                 if (step === 'review') setStep('scheduling');
               }} className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors">
                 <ChevronLeft className="size-4" /> Back
               </button>
             )}
          </div>
          <div>
            {step === 'settings' && (
              <TealButton onClick={() => setStep('logic')} disabled={!name}>
                Continue to Logic <ChevronRight className="size-4" />
              </TealButton>
            )}
            {step === 'logic' && (
              <TealButton onClick={() => setStep('contacts')} disabled={nodes.length === 0}>
                Continue to Contacts <ChevronRight className="size-4" />
              </TealButton>
            )}
            {step === 'contacts' && (
              <TealButton onClick={() => setStep('scheduling')} disabled={!contacts.length || !columnMapping['email']}>
                Continue to Scheduling <ChevronRight className="size-4" />
              </TealButton>
            )}
            {step === 'scheduling' && (
              <TealButton onClick={() => setStep('review')}>
                Review Sequence <ChevronRight className="size-4" />
              </TealButton>
            )}
            {step === 'review' && (
              <TealButton onClick={handleLaunch} loading={isSubmitting} className="min-w-[140px] justify-center">
                {isSubmitting ? 'Launching...' : 'Activate Sequence'}
              </TealButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
