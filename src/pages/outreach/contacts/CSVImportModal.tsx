import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Upload,
  Check,
  Database,
  ChevronRight
} from 'lucide-react';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useTranslation } from '@/contexts/TranslationContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { TealButton } from '../OutreachCommon';
import Papa from 'papaparse';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultListId?: string;
  lists: any[];
}

export default function CSVImportModal({
  isOpen,
  onClose,
  onSuccess,
  defaultListId,
  lists
}: CSVImportModalProps) {
  const { t } = useTranslation();
  const api = useOutreachApi();
  const [file, setFile] = useState<File | null>(null);
  const [listId, setListId] = useState<string>(defaultListId || '');
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    first_name: '',
    last_name: '',
    email: '',
    company: '',
    job_title: '',
    phone: '',
    linkedin: '',
    location_city: '',
    location_country: '',
    website: ''
  });
  const [importPreview, setImportPreview] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setCsvData([]);
      setListId(defaultListId || '');
    }
  }, [isOpen, defaultListId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv')) {
        processFile(droppedFile);
      } else {
        toast.error(t('outreach.contacts.importModal.toastErrorCSV'));
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data);
        if (results.meta.fields) {
          setCsvHeaders(results.meta.fields);
          const newMapping = { ...mapping };
          results.meta.fields.forEach(header => {
            const h = header.toLowerCase();
            if (h.includes('first') || h === 'fname') newMapping.first_name = header;
            if (h.includes('last') || h === 'lname') newMapping.last_name = header;
            if (h.includes('email') || h === 'mail') newMapping.email = header;
            if (h.includes('company') || h === 'org') newMapping.company = header;
            if (h.includes('title') || h.includes('job') || h === 'role') newMapping.job_title = header;
            if (h.includes('phone') || h === 'tel') newMapping.phone = header;
            if (h.includes('linkedin')) newMapping.linkedin = header;
            if (h.includes('city')) newMapping.location_city = header;
            if (h.includes('country')) newMapping.location_country = header;
            if (h.includes('website') || h === 'site' || h === 'url') newMapping.website = header;
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
        company: row[mapping.company] || '',
        job_title: row[mapping.job_title] || '',
        phone: row[mapping.phone] || '',
        linkedin: row[mapping.linkedin] || '',
        location_city: row[mapping.location_city] || '',
        location_country: row[mapping.location_country] || '',
        website: row[mapping.website] || ''
      }));
      setImportPreview(preview);
    }
  }, [mapping, csvData]);

  const getTotalValid = () => {
    if (!csvData.length) return 0;
    return csvData.filter(r => r[mapping.email] && String(r[mapping.email]).includes('@')).length;
  };

  const handleImport = async () => {
    if (!file) return;
    if (!mapping.email) {
      toast.error('Email mapping is required');
      return;
    }

    setIsImporting(true);
    try {
      const mappedData = csvData.map(row => ({
        first_name: row[mapping.first_name] || '',
        last_name: row[mapping.last_name] || '',
        email: row[mapping.email] || '',
        company: row[mapping.company] || '',
        job_title: row[mapping.job_title] || '',
        phone: row[mapping.phone] || '',
        linkedin: row[mapping.linkedin] || '',
        location_city: row[mapping.location_city] || '',
        location_country: row[mapping.location_country] || '',
        website: row[mapping.website] || '',
      })).filter(r => r.email && String(r.email).includes('@'));

      if (mappedData.length === 0) {
        toast.error('No valid emails found to import.');
        setIsImporting(false);
        return;
      }

      const csvString = Papa.unparse(mappedData);
      const newFile = new File([csvString], file.name || "mapped_contacts.csv", { type: "text/csv" });

      const result = await api.importContactsCSV(newFile, listId || undefined);
      toast.success(t('outreach.contacts.importModal.success', { count: result.count }));
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || t('outreach.contacts.importModal.error'));
    } finally {
      setIsImporting(false);
    }
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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-teal-500/5 to-transparent shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Upload className="size-6 text-teal-400" />
              {t('outreach.contacts.importModal.title')}
            </h2>
            <p className="text-slate-400 text-sm mt-1">{t('outreach.contacts.importModal.subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white/5 text-slate-500 hover:text-white transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {!file ? (
            <div className="space-y-6">
              <label
                className={cn(
                  "flex flex-col items-center justify-center p-16 border-2 border-dashed rounded-[32px] transition-all cursor-pointer group",
                  dragActive
                    ? "border-teal-500 bg-teal-500/10"
                    : "border-white/10 bg-white/[0.01] hover:bg-teal-500/5 hover:border-teal-500/20"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="size-20 rounded-[28px] bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-6 text-teal-400 group-hover:scale-110 transition-transform">
                  <Upload className="size-8" />
                </div>
                <h4 className="text-xl font-bold text-white mb-2">{t('outreach.contacts.importModal.dragDrop')}</h4>
                <p className="text-slate-500 text-sm max-w-xs text-center leading-relaxed">
                  {t('outreach.contacts.importModal.onlyCSV')}
                </p>
                <input ref={fileInputRef} type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
              </label>

              <div className="space-y-2 max-w-sm mx-auto">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                  {t('outreach.contacts.importModal.addToList')}
                </label>
                <div className="relative group">
                  <Database className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
                  <select
                    value={listId}
                    onChange={(e) => setListId(e.target.value)}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none transition-all group-hover:border-slate-600"
                  >
                    <option value="">{t('outreach.contacts.importModal.dontAdd')}</option>
                    {lists.map(list => (
                      <option key={list.id} value={list.id}>{list.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronRight className="size-4 text-slate-500 rotate-90" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <Check className="size-5 text-teal-400" />
                    Mapping Configuration
                  </h4>
                  <button onClick={() => setFile(null)} className="text-xs text-red-400 hover:underline">Change File</button>
                </div>

                <div className="space-y-4">
                  {[
                    { key: 'first_name', label: 'First Name' },
                    { key: 'last_name', label: 'Last Name' },
                    { key: 'email', label: 'Email Address *' },
                    { key: 'company', label: 'Company' },
                    { key: 'job_title', label: 'Job Title' },
                    { key: 'phone', label: 'Phone Number' },
                    { key: 'linkedin', label: 'LinkedIn URL' },
                    { key: 'location_city', label: 'City' },
                    { key: 'location_country', label: 'Country' },
                    { key: 'website', label: 'Website' },
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

                <div className="space-y-2 pt-4 border-t border-white/5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                    {t('outreach.contacts.importModal.addToList')}
                  </label>
                  <div className="relative group">
                    <Database className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
                    <select
                      value={listId}
                      onChange={(e) => setListId(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none transition-all group-hover:border-slate-600"
                    >
                      <option value="">{t('outreach.contacts.importModal.dontAdd')}</option>
                      {lists.map(list => (
                        <option key={list.id} value={list.id}>{list.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronRight className="size-4 text-slate-500 rotate-90" />
                    </div>
                  </div>
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
                  {csvData.length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-sm">
                      No data to preview
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-white/5 bg-[#0d1117] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                <div className="size-8 rounded-full bg-slate-800 border-2 border-[#0d1117] flex items-center justify-center text-[10px] font-bold text-slate-500">
                  <Database className="size-3.5" />
                </div>
              </div>
              <p className="text-sm font-medium text-slate-400">
                Total valid: <span className="text-white font-bold text-base ml-1">
                  {getTotalValid()}
                </span>
              </p>
            </div>
            <div className="flex gap-4">
              <button onClick={onClose} className="px-8 py-3 rounded-2xl font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
              <TealButton
                onClick={handleImport}
                loading={isImporting}
                disabled={!file || getTotalValid() === 0 || isImporting}
                className="px-12 py-3 shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)]"
              >
                Import Contacts
              </TealButton>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
