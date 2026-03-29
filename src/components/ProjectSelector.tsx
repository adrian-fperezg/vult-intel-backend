import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Folder, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProject } from '@/contexts/ProjectContext';
import { getProjects, Project } from '@/services/scanService';
import { AnimatePresence, motion } from 'framer-motion';

export default function ProjectSelector({ forceShow = false }: { forceShow?: boolean }) {
    const { activeProjectId, activeProject, selectProject, isLoading, projects } = useProject();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const currentProject = activeProject?.project || projects.find(p => p.id === activeProjectId);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-200",
                    "bg-surface-dark/50 backdrop-blur-md border-surface-border hover:border-blue-500/30",
                    "group w-full min-w-[200px] text-left shadow-sm"
                )}
            >
                <div className="size-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                    <Folder className="size-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none mb-1 opacity-70">
                        Project
                    </p>
                    <h3 className="text-sm font-semibold text-white truncate leading-tight">
                        {isLoading ? 'Syncing...' : String(currentProject?.name || 'Select Project')}
                    </h3>
                </div>
                <ChevronDown className={cn("size-4 text-slate-500 transition-transform duration-200 group-hover:text-slate-300", isOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 8 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="absolute top-full left-0 mt-3 w-full min-w-[200px] lg:min-w-[240px] bg-[#111318] border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                    >
                        <div className="p-2 max-h-[320px] overflow-y-auto custom-scrollbar">
                            {projects.length === 0 ? (
                                <div className="p-6 text-center">
                                    <Folder className="size-8 text-slate-700 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm text-slate-500">No active projects yet</p>
                                </div>
                            ) : (
                                projects.map((project) => (
                                    <button
                                        key={project.id}
                                        onClick={() => {
                                            selectProject(project.id);
                                            setIsOpen(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group mb-1 last:mb-0",
                                            activeProjectId === project.id
                                                ? "bg-blue-600/10 border border-blue-500/20 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]"
                                                : "hover:bg-white/5 border border-transparent"
                                        )}
                                    >
                                        <div className="size-10 rounded-xl bg-surface-dark border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                                            <Folder className="size-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">
                                                {String(project.name)}
                                            </h4>
                                            <p className="text-[11px] text-slate-500 truncate opacity-70">
                                                {String(project.url)}
                                            </p>
                                        </div>
                                        {activeProjectId === project.id && (
                                            <div className="size-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                                                <Check className="size-3.5 text-blue-400" strokeWidth={3} />
                                            </div>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                        <div className="p-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-2 text-[11px] font-medium text-slate-500 hover:text-white transition-colors"
                            >
                                <Sparkles className="size-3.5" />
                                Sync Project Data
                            </button>
                            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{projects.length} Total</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
