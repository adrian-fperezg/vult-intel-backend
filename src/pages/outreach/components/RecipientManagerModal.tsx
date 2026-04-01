import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Plus, Upload, Users, UserPlus,
  FileText, Check, AlertCircle, ChevronRight,
  Trash2, Download, Loader2
} from 'lucide-react';
import { TealButton, OutreachBadge } from '../OutreachCommon';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import Papa from 'papaparse';

interface RecipientManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (recipients: any[]) => Promise<void>;
  api: any;
}

type Tab = 'crm' | 'manual' | 'csv';

export default function RecipientManagerModal({
  isOpen,
  onClose,
  onConfirm,
  api
}: RecipientManagerModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('crm');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // CRM State
  const [lists, setLists] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  // Manual State
  const [manualRows, setManualRows] = useState<any[]>([
    { first_name: '', last_name: '', email: '', company: '' }
  ]);

  // CSV State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    first_name: '',
    last_name: '',
    email: '',
    company: ''
  });
  const [importPreview, setImportPreview] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadCrmData();
      // Limpiar selecciones al abrir para poder agregar nuevos baches
      setSelectedListIds([]);
      setSelectedContactIds([]);
      setManualRows([{ first_name: '', last_name: '', email: '', company: '' }]);
      setCsvFile(null);
      setCsvData([]);
    }
  }, [isOpen]);

  const loadCrmData = async () => {
    setIsLoading(true);
    try {
      const [allLists, allContacts] = await Promise.all([
        api.fetchContactLists(),
        api.fetchContacts()
      ]);
      setLists(allLists || []);
      setContacts(allContacts || []);
    } catch (err) {
      toast.error('Failed to load CRM data');
    } finally {
      setIsLoading(false);
    }
  };

  // ── CRM Handlers ───────────────────────────────────────────────────────────
  const toggleList = (id: string) => {
    setSelectedListIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // ── Manual Handlers ────────────────────────────────────────────────────────
  const updateManualRow = (index: number, field: string, value: string) => {
    const newRows = [...manualRows];
    newRows[index][field] = value;
    setManualRows(newRows);
  };

  const addManualRow = () => {
    setManualRows([...manualRows, { first_name: '', last_name: '', email: '', company: '' }]);
  };

  const removeManualRow = (index: number) => {
    if (manualRows.length === 1) return;
    setManualRows(manualRows.filter((_, i) => i !== index));
  };

  // ── CSV Handlers ───────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data);
        if (results.meta.fields) {
          setCsvHeaders(results.meta.fields);
          // Auto-mapping attempt
          const newMapping = { ...mapping };
          results.meta.fields.forEach(header => {
            const h = header.toLowerCase();
            if (h.includes('first') || h === 'fname') newMapping.first_name = header;
            if (h.includes('last') || h === 'lname') newMapping.last_name = header;
            if (h.includes('email') || h === 'mail') newMapping.email = header;
            if (h.includes('company') || h === 'org') newMapping.company = header;
          });
          setMapping(newMapping);
        }
      }
    });
  };

  useEffect(() => {
    if (csvData.length > 0) {
      const preview = csvData.slice(0, 5).map(row => ({
        first_name: row[mapping.first_name] || '',
        last_name: row[mapping.last_name] || '',
        email: row[mapping.email] || '',
        company: row[mapping.company] || ''
      }));
      setImportPreview(preview);
    }
  }, [mapping, csvData]);

  // ── Final Confirm (EL CAMBIO PRINCIPAL ESTÁ AQUÍ) ──────────────────────────
  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      let finalRecipients: any[] = [];

      if (activeTab === 'crm') {
        // Formato mixto que el backend espera: { id: '...' } y { list_id: '...' }
        finalRecipients = [
          ...selectedContactIds.map(id => ({ id })),
          ...selectedListIds.map(listId => ({ list_id: listId }))
        ];

        if (finalRecipients.length === 0) {
          toast.error("Please select at least one contact or list.");
          setIsSaving(false);
          return;
        }

      } else if (activeTab === 'manual') {
        const validRows = manualRows.filter(r => r.email.includes('@'));
        if (validRows.length === 0) {
          toast.error('Please add at least one valid email');
          setIsSaving(false);
          return;
        }
        finalRecipients = validRows.map(r => ({ ...r, type: 'manual' }));
      } else if (activeTab === 'csv') {
        if (!mapping.email) {
          toast.error('Email mapping is required');
          setIsSaving(false);
          return;
        }
        finalRecipients = csvData.map(row => ({
          first_name: row[mapping.first_name] || '',
          last_name: row[mapping.last_name] || '',
          email: row[mapping.email] || '',
          company: row[mapping.company] || '',
          type: 'csv'
        })).filter(r => r.email && r.email.includes('@'));
      }

      await onConfirm(finalRecipients);
      onClose(); // Solo cerramos si fue exitoso
    } catch (err) {
      toast.error('Failed to assign recipients');
    } finally {
      setIsSaving(false);
    }
  };

  // Cálculo del total seleccionado para el footer
  const getTotalSelected = () => {
    if (activeTab === 'crm') return selectedContactIds.length + selectedListIds.length;
    if (activeTab === 'manual') return manualRows.filter(r => r.email.includes('@')).length;
    if (activeTab === 'csv') return csvData.filter(r => r[mapping.email] && String(r[mapping.email]).includes('@')).length;
    return 0;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-4xl bg-[#0d1117] border border-white/10 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-teal-500/5 to-transparent">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Users className="size-6 text-teal-400" />
              Manage Audience
            </h2>
            <p className="text-slate-400 text-sm mt-1">Select or import recipients for this sequence</p>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white/5 text-slate-500 hover:text-white transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-8 border-b border-white/5 bg-[#0d1117]">
          {[
            { id: 'crm', label: 'CRM Contacts', icon: Users },
            { id: 'manual', label: 'Manual Entry', icon: UserPlus },
            { id: 'csv', label: 'CSV Import', icon: Upload }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={cn(
                'flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all relative',
                activeTab === tab.id ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTabRecipients"
                  className="absolute bottom-0 left-0 right-0 h-1 bg-teal-500 rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'crm' && (
              <motion.div
                key="crm"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-500" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search lists or contacts..."
                    className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none focus:border-teal-500/50 transition-all font-medium"
                  />
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="size-8 text-teal-500 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Saved Lists</label>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {lists.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                          <p className="text-xs text-slate-500 px-2">No lists found.</p>
                        )}
                        {lists.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase())).map(list => (
                          <button
                            key={list.id}
                            onClick={() => toggleList(list.id)}
                            className={cn(
                              'w-full flex items-center justify-between p-4 rounded-2xl border transition-all group',
                              selectedListIds.includes(list.id)
                                ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20'
                                : 'bg-white/5 border-white/5 hover:border-white/10'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'size-10 rounded-xl flex items-center justify-center transition-colors',
                                selectedListIds.includes(list.id) ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-800 text-slate-500'
                              )}>
                                <Users className="size-5" />
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-bold text-white">{list.name}</p>
                                <p className="text-[10px] text-slate-500">Will enroll all active contacts</p>
                              </div>
                            </div>
                            {selectedListIds.includes(list.id) && <Check className="size-5 text-teal-400" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Individual Contacts</label>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {contacts.filter(c =>
                          (c.first_name + ' ' + c.last_name + ' ' + c.email).toLowerCase().includes(searchQuery.toLowerCase())
                        ).length === 0 && (
                            <p className="text-xs text-slate-500 px-2">No contacts found.</p>
                          )}
                        {contacts.filter(c =>
                          (c.first_name + ' ' + c.last_name + ' ' + c.email).toLowerCase().includes(searchQuery.toLowerCase())
                        ).map(contact => (
                          <button
                            key={contact.id}
                            onClick={() => toggleContact(contact.id)}
                            className={cn(
                              'w-full flex items-center justify-between p-4 rounded-2xl border transition-all group',
                              selectedContactIds.includes(contact.id)
                                ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20'
                                : 'bg-white/5 border-white/5 hover:border-white/10'
                            )}
                          >
                            <div className="flex items-center gap-3 text-left overflow-hidden">
                              <div className={cn(
                                'size-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0',
                                selectedContactIds.includes(contact.id) ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-800 text-slate-400'
                              )}>
                                {contact.first_name?.[0] || ''}{contact.last_name?.[0] || ''}
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-sm font-bold text-white truncate">{contact.first_name} {contact.last_name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{contact.email}</p>
                              </div>
                            </div>
                            {selectedContactIds.includes(contact.id) && <Check className="size-5 text-teal-400 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'manual' && (
              <motion.div
                key="manual"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div className="bg-white/5 border border-white/10 rounded-[24px] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className="px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">First Name</th>
                        <th className="px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Name</th>
                        <th className="px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</th>
                        <th className="px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Company</th>
                        <th className="px-6 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {manualRows.map((row, idx) => (
                        <tr key={idx} className="group">
                          <td className="p-2 px-4">
                            <input
                              className="w-full bg-transparent border-none outline-none text-sm text-white px-2 py-1 placeholder:text-slate-700"
                              placeholder="John"
                              value={row.first_name}
                              onChange={e => updateManualRow(idx, 'first_name', e.target.value)}
                            />
                          </td>
                          <td className="p-2 px-4">
                            <input
                              className="w-full bg-transparent border-none outline-none text-sm text-white px-2 py-1 placeholder:text-slate-700"
                              placeholder="Doe"
                              value={row.last_name}
                              onChange={e => updateManualRow(idx, 'last_name', e.target.value)}
                            />
                          </td>
                          <td className="p-2 px-4">
                            <input
                              className="w-full bg-transparent border-none outline-none text-sm text-teal-400 px-2 py-1 placeholder:text-slate-700"
                              placeholder="john@example.com"
                              value={row.email}
                              onChange={e => updateManualRow(idx, 'email', e.target.value)}
                            />
                          </td>
                          <td className="p-2 px-4">
                            <input
                              className="w-full bg-transparent border-none outline-none text-sm text-white px-2 py-1 placeholder:text-slate-700"
                              placeholder="Acme Inc"
                              value={row.company}
                              onChange={e => updateManualRow(idx, 'company', e.target.value)}
                            />
                          </td>
                          <td className="p-2 px-4">
                            <button
                              onClick={() => removeManualRow(idx)}
                              className="size-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={addManualRow}
                  className="w-full py-4 border-2 border-dashed border-white/5 rounded-2xl text-slate-500 hover:text-teal-400 hover:border-teal-500/20 hover:bg-teal-500/5 transition-all font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Plus className="size-4" /> Add Another Row
                </button>
              </motion.div>
            )}

            {activeTab === 'csv' && (
              <motion.div
                key="csv"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                {!csvFile ? (
                  <label className="flex flex-col items-center justify-center p-16 border-2 border-dashed border-white/10 rounded-[32px] bg-white/[0.01] hover:bg-teal-500/5 hover:border-teal-500/20 transition-all cursor-pointer group">
                    <div className="size-20 rounded-[28px] bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-6 text-teal-400 group-hover:scale-110 transition-transform">
                      <Upload className="size-8" />
                    </div>
                    <h4 className="text-xl font-bold text-white mb-2">Upload CSV File</h4>
                    <p className="text-slate-500 text-sm max-w-xs text-center leading-relaxed">
                      Drag and drop your contact list here. We'll help you map the columns.
                    </p>
                    <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
                  </label>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                          <Check className="size-5 text-teal-400" />
                          Mapping Configuration
                        </h4>
                        <button onClick={() => setCsvFile(null)} className="text-xs text-red-400 hover:underline">Change File</button>
                      </div>

                      <div className="space-y-4">
                        {[
                          { key: 'first_name', label: 'First Name' },
                          { key: 'last_name', label: 'Last Name' },
                          { key: 'email', label: 'Email Address *' },
                          { key: 'company', label: 'Company' },
                        ].map(field => (
                          <div key={field.key} className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{field.label}</label>
                            <select
                              value={mapping[field.key]}
                              onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-teal-500/50"
                            >
                              <option value="">-- Ignore --</option>
                              {csvHeaders.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">Import Preview</h4>
                      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
                        {importPreview.map((row, i) => (
                          <div key={i} className="p-4 flex items-center justify-between">
                            <div className="overflow-hidden">
                              <p className="text-sm font-bold text-white truncate">{row.first_name || '—'} {row.last_name || '—'}</p>
                              <p className="text-[10px] text-slate-500 truncate">{row.email || 'No email'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-teal-400 truncate">{row.company}</p>
                            </div>
                          </div>
                        ))}
                        {csvData.length > 5 && (
                          <div className="p-4 bg-teal-500/5 text-center text-[10px] font-bold text-teal-400 uppercase tracking-tighter">
                            + {csvData.length - 5} more records
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-white/5 bg-[#0d1117] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              <div className="size-8 rounded-full bg-slate-800 border-2 border-[#0d1117] flex items-center justify-center text-[10px] font-bold text-slate-500">
                <Users className="size-3.5" />
              </div>
            </div>
            <p className="text-sm font-medium text-slate-400">
              Total selected: <span className="text-white font-bold text-base ml-1">
                {getTotalSelected()}
              </span>
            </p>
          </div>
          <div className="flex gap-4">
            <button onClick={onClose} className="px-8 py-3 rounded-2xl font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
            <TealButton
              onClick={handleConfirm}
              loading={isSaving}
              disabled={getTotalSelected() === 0 || isSaving}
              className="px-12 py-3 shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)]"
            >
              Enroll Recipients
            </TealButton>
          </div>
        </div>
      </motion.div>
    </div>
  );
}