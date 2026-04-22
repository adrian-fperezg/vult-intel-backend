import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Database
} from 'lucide-react';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useSettings } from '@/contexts/SettingsContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

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
  const { language } = useSettings();
  const { importContactsCSV } = useOutreachApi();
  const [file, setFile] = useState<File | null>(null);
  const [listId, setListId] = useState<string>(defaultListId || '');
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = useMemo(() => {
    const translations = {
      en: {
        title: "Import Contacts",
        subtitle: "Upload a CSV file to add contacts",
        toastErrorCSV: "Please upload a CSV file",
        toastSuccess: (count: number) => `Successfully imported ${count} contacts`,
        toastErrorFail: "Failed to import contacts",
        dragDrop: "Drag and drop your CSV file here",
        onlyCSV: "Only .csv files are supported",
        browse: "Browse Files",
        readyToImport: "Ready to import",
        changeFile: "Change File",
        addToList: "Add to List (Optional)",
        dontAdd: "Don't add to list",
        guidelinesTitle: "Import Guidelines",
        guideline1: "Use \"Email\" header for the primary email address",
        guideline2: "\"First Name\", \"Last Name\", \"Company\", \"Title\", \"Phone\", \"LinkedIn\" will be auto-mapped",
        guideline3: "Any other headers will be saved as Custom Fields",
        guideline4: "Duplicate emails (per project) will be updated with new data",
        cancel: "Cancel",
        importing: "Importing...",
        finalize: "Finalize Import",
        kb: "KB"
      },
      es: {
        title: "Importar Contactos",
        subtitle: "Sube un archivo CSV para añadir contactos",
        toastErrorCSV: "Por favor sube un archivo CSV",
        toastSuccess: (count: number) => `Se importaron con éxito ${count} contactos`,
        toastErrorFail: "Error al importar contactos",
        dragDrop: "Arrastra y suelta tu archivo CSV aquí",
        onlyCSV: "Solo se admiten archivos .csv",
        browse: "Buscar Archivos",
        readyToImport: "Listo para importar",
        changeFile: "Cambiar Archivo",
        addToList: "Añadir a Lista (Opcional)",
        dontAdd: "No añadir a lista",
        guidelinesTitle: "Guías de Importación",
        guideline1: "Usa el encabezado \"Email\" para la dirección de correo principal",
        guideline2: "\"First Name\", \"Last Name\", \"Company\", \"Title\", \"Phone\", \"LinkedIn\" se mapearán automáticamente",
        guideline3: "Cualquier otro encabezado se guardará como Campos Personalizados",
        guideline4: "Los correos duplicados (por proyecto) se actualizarán con los nuevos datos",
        cancel: "Cancelar",
        importing: "Importando...",
        finalize: "Finalizar Importación",
        kb: "KB"
      }
    };
    return translations[language as keyof typeof translations] || translations.en;
  }, [language]);

  if (!isOpen) return null;

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
        setFile(droppedFile);
      } else {
        toast.error(t.toastErrorCSV);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await importContactsCSV(file, listId || undefined);
      toast.success(t.toastSuccess(result.count));
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || t.toastErrorFail);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-[#0d1117] border border-[#30363d] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/10 rounded-lg">
              <Upload className="size-5 text-teal-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{t.title}</h3>
              <p className="text-xs text-slate-400">{t.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* File Upload Area */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-xl p-10 transition-all duration-200 flex flex-col items-center justify-center text-center group",
              dragActive
                ? "border-teal-500 bg-teal-500/5"
                : file
                  ? "border-teal-500/30 bg-teal-500/5"
                  : "border-[#30363d] hover:border-[#8b949e] bg-[#0d1117]"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {!file ? (
              <>
                <div className="p-4 bg-[#161b22] rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                  <FileText className="size-10 text-slate-400 group-hover:text-teal-400 transition-colors" />
                </div>
                <h4 className="text-sm font-medium text-white mb-1">
                  {t.dragDrop}
                </h4>
                <p className="text-xs text-slate-500 mb-6">
                  {t.onlyCSV}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-[#30363d] rounded-lg text-sm font-semibold text-white transition-all active:scale-95"
                >
                  {t.browse}
                </button>
              </>
            ) : (
              <>
                <div className="p-4 bg-teal-500/10 rounded-2xl mb-4 scale-110">
                  <CheckCircle2 className="size-10 text-teal-400" />
                </div>
                <h4 className="text-sm font-medium text-white mb-1">
                  {file.name}
                </h4>
                <p className="text-xs text-teal-500/70 mb-6">
                  {(file.size / 1024).toFixed(1)} {t.kb} • {t.readyToImport}
                </p>
                <button
                  onClick={() => setFile(null)}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors font-medium underline underline-offset-4"
                >
                  {t.changeFile}
                </button>
              </>
            )}
          </div>

          {/* List Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
              {t.addToList}
            </label>
            <div className="relative group">
              <Database className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none transition-all group-hover:border-slate-600"
              >
                <option value="">{t.dontAdd}</option>
                {lists.map(list => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight className="size-4 text-slate-500 rotate-90" />
              </div>
            </div>
          </div>

          {/* Guidelines */}
          <div className="p-4 bg-teal-500/5 border border-teal-500/10 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="size-4 text-teal-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-teal-400">{t.guidelinesTitle}</p>
                <ul className="text-[11px] text-slate-400 space-y-1 list-disc pl-3">
                  <li>{t.guideline1}</li>
                  <li>{t.guideline2}</li>
                  <li>{t.guideline3}</li>
                  <li>{t.guideline4}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-[#30363d] flex items-center bg-[#161b22]/30 gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-[#30363d] rounded-xl text-sm font-semibold text-slate-300 transition-all active:scale-95"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleImport}
            disabled={!file || isImporting}
            className="flex-[2] relative overflow-hidden px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 rounded-xl text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:from-slate-700 disabled:to-slate-800 disabled:shadow-none"
          >
            <div className="flex items-center justify-center gap-2">
              {isImporting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>{t.importing}</span>
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  <span>{t.finalize}</span>
                </>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
