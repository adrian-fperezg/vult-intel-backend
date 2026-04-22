import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Plus, FolderPlus } from 'lucide-react';
import { TealButton } from '../OutreachCommon';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useSettings } from '@/hooks/useSettings';
import { useMemo } from 'react';

interface BulkAddToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (listId: string) => Promise<void>;
  contactLists: any[];
  onReloadLists: () => void;
  api: any;
  selectedCount: number;
}

export default function BulkAddToListModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  contactLists, 
  onReloadLists,
  api,
  selectedCount 
}: BulkAddToListModalProps) {
  const { language } = useSettings();
  const t = useMemo(() => {
    const isEs = language === 'es';
    return {
      addToList: isEs ? 'Agregar a Lista' : 'Add to List',
      assignToDesc: (count: number) => isEs ? `Asignar ${count} contactos a una lista` : `Assign ${count} contacts to a list`,
      searchLists: isEs ? 'Buscar listas...' : 'Search lists...',
      noListsFound: (q: string) => isEs ? `No se encontraron listas que coincidan con "${q}"` : `No lists found matching "${q}"`,
      createNewList: isEs ? 'Crear Nueva Lista' : 'Create New List',
      newListName: isEs ? 'Nombre de la Nueva Lista' : 'New List Name',
      listNamePlaceholder: isEs ? 'ej. Leads de Q1' : 'e.g. Q1 Enterprise Leads',
      back: isEs ? 'Atrás' : 'Back',
      createAndAdd: isEs ? 'Crear y Agregar' : 'Create & Add',
      failedCreateList: isEs ? 'Error al crear la lista' : 'Failed to create list'
    };
  }, [language]);

  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const filteredLists = contactLists.filter(l => 
    l.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    setIsLoading(true);
    try {
      const newList = await api.createContactList(newListName.trim());
      onReloadLists();
      await onConfirm(newList.id);
      setNewListName('');
      setIsCreating(false);
    } catch (err) {
      toast.error(t.failedCreateList);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{t.addToList}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t.assignToDesc(selectedCount)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!isCreating ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t.searchLists}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-teal-500/50"
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                {filteredLists.map(list => (
                  <button
                    key={list.id}
                    onClick={() => onConfirm(list.id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left group"
                  >
                    <span className="text-sm font-medium text-slate-300 group-hover:text-white">{list.name}</span>
                    <Plus className="size-4 text-slate-600 group-hover:text-teal-400" />
                  </button>
                ))}
                
                {filteredLists.length === 0 && query && (
                  <div className="py-8 text-center">
                    <p className="text-sm text-slate-500">{t.noListsFound(query)}</p>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-white/5">
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-all text-sm font-bold"
                >
                  <FolderPlus className="size-4" />
                  {t.createNewList}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.newListName}</label>
                <input
                  autoFocus
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  placeholder={t.listNamePlaceholder}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-teal-500/50"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-sm font-bold border border-white/5 transition-all"
                >
                  {t.back}
                </button>
                <TealButton
                  onClick={handleCreateList}
                  loading={isLoading}
                  className="flex-1 py-3"
                >
                  {t.createAndAdd}
                </TealButton>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
