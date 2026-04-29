import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Upload, FileText, CheckCircle2, AlertCircle, 
  Loader2, Plus, Info, FileSpreadsheet
} from 'lucide-react';
import Papa from 'papaparse';
import { cn } from '@/lib/utils';
import { TealButton } from '../OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useTranslation } from '@/contexts/TranslationContext';
import toast from 'react-hot-toast';

interface UploadListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadListModal({ isOpen, onClose, onSuccess }: UploadListModalProps) {
  const { t, language } = useTranslation();
  const api = useOutreachApi();
  const [listName, setListName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedContacts, setParsedContacts] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
        toast.error(t('outreach.contacts.uploadModal.invalidFile'));
        return;
      }
      setFile(selectedFile);
      parseCSV(selectedFile);
    }
  };

  const parseCSV = (file: File) => {
    setIsParsing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];
        const mapped = rows.map(row => {
          // Normalize headers (case-insensitive and common variants)
          const findVal = (variants: string[]) => {
            const key = Object.keys(row).find(k => 
              variants.some(v => k.toLowerCase().includes(v.toLowerCase()))
            );
            return key ? row[key] : null;
          };

          return {
            email: findVal(['email', 'e-mail', 'correo']),
            firstName: findVal(['first name', 'first_name', 'nombre', 'given name']),
            lastName: findVal(['last name', 'last_name', 'apellido', 'surname', 'family name']),
            company: findVal(['company', 'empresa', 'organization', 'account']),
            title: findVal(['title', 'position', 'cargo', 'job']),
            phone: findVal(['phone', 'tel', 'mobile', 'celular']),
            linkedin: findVal(['linkedin', 'social']),
            website: findVal(['website', 'site', 'url']),
            location: findVal(['location', 'city', 'country', 'ubicación']),
            industry: findVal(['industry', 'sector']),
            companySize: findVal(['size', 'employees', 'tamaño']),
            tags: findVal(['tags', 'etiquetas'])
          };
        }).filter(c => c.email && c.email.includes('@'));

        setParsedContacts(mapped);
        setIsParsing(false);
      },
      error: () => {
        toast.error(t('outreach.contacts.uploadModal.parseError'));
        setIsParsing(false);
      }
    });
  };

  const handleUpload = async () => {
    if (!listName.trim()) {
      toast.error(language === 'es' ? 'Por favor ingresa un nombre para la lista' : 'Please enter a list name');
      return;
    }
    if (parsedContacts.length === 0) {
      toast.error(t('outreach.contacts.uploadModal.noEmailError'));
      return;
    }

    setIsUploading(true);
    try {
      await api.createPopulatedList(listName.trim(), parsedContacts);
      toast.success(t('outreach.contacts.uploadModal.success', { count: parsedContacts.length }));
      onSuccess();
      onClose();
      // Reset state
      setListName('');
      setFile(null);
      setParsedContacts([]);
    } catch (err) {
      console.error(err);
      toast.error(t('outreach.contacts.uploadModal.error'));
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-xl bg-[#0A0A0B] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-8 py-6 border-b border-white/5 bg-gradient-to-r from-teal-500/10 via-transparent to-transparent">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-white">{t('outreach.contacts.uploadModal.title')}</h2>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400">{t('outreach.contacts.uploadModal.subtitle')}</p>
          </div>

          <div className="p-8 space-y-6">
            {/* List Name Input */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">
                {t('outreach.contacts.uploadModal.listName')}
              </label>
              <input
                type="text"
                value={listName}
                onChange={e => setListName(e.target.value)}
                placeholder={t('outreach.contacts.uploadModal.listNamePlaceholder')}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-teal-500/40 rounded-2xl text-white placeholder:text-slate-600 outline-none transition-all"
              />
            </div>

            {/* File Upload Area */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">
                {t('outreach.contacts.uploadModal.selectFile')}
              </label>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative group cursor-pointer border-2 border-dashed rounded-3xl transition-all p-10 flex flex-col items-center justify-center gap-4",
                  file 
                    ? "border-teal-500/40 bg-teal-500/5" 
                    : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10"
                )}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv"
                  className="hidden"
                />
                
                {file ? (
                  <>
                    <div className="p-4 bg-teal-500/20 rounded-2xl text-teal-400 group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="size-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-white mb-1">{file.name}</p>
                      <p className="text-xs text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB • {isParsing ? t('outreach.contacts.uploadModal.processing') : t('outreach.contacts.uploadModal.mappedFields', { count: parsedContacts.length })}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-4 bg-white/5 rounded-2xl text-slate-500 group-hover:text-slate-300 group-hover:scale-110 transition-all">
                      <Upload className="size-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-white mb-1">{t('outreach.contacts.uploadModal.dropFile')}</p>
                      <p className="text-xs text-slate-400">{t('outreach.contacts.uploadModal.orBrowse')}</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Column Mapping Info */}
            {parsedContacts.length > 0 && (
              <div className="p-4 bg-teal-500/5 border border-teal-500/10 rounded-2xl flex gap-4">
                <div className="shrink-0 p-2 bg-teal-500/10 rounded-xl text-teal-400">
                  <Info className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-teal-400 mb-1">{t('outreach.contacts.uploadModal.columnMapping')}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t('outreach.contacts.uploadModal.columnMappingDesc')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-6 bg-white/5 border-t border-white/5 flex items-center justify-end gap-4">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-6 py-2.5 text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
              {t('outreach.contacts.uploadModal.cancel')}
            </button>
            <TealButton
              onClick={handleUpload}
              loading={isUploading}
              disabled={!file || !listName || isParsing || parsedContacts.length === 0}
              className="px-8"
            >
              <CheckCircle2 className="size-4 mr-2" />
              {t('outreach.contacts.uploadModal.upload')}
            </TealButton>
          </div>

          {/* Progress Overlay */}
          {(isParsing || isUploading) && (
            <div className="absolute inset-0 bg-[#0A0A0B]/60 backdrop-blur-[2px] flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-8 text-teal-500 animate-spin" />
                <p className="text-sm font-bold text-white">
                  {isParsing ? t('outreach.contacts.uploadModal.processing') : t('outreach.contacts.uploadModal.creating')}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
