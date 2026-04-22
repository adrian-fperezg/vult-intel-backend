import { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Rocket,
  Info,
  ChevronDown,
  Settings,
  Bell,
  Filter,
  MoreHorizontal,
  Search,
  CheckCircle2,
  Loader2,
  Clock,
  X,
  ShieldCheck,
  Globe,
  Cpu,
  FileText,
  BarChart3,
  Zap,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { runFullScan, saveProject, getProjects, deleteProject, Project } from '@/services/scanService';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { extractAndSavePersonas } from '@/services/ai';
import { useProject } from '@/contexts/ProjectContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTranslation } from '@/contexts/TranslationContext';

const scanSteps = [
  { id: 'brand', label: 'Brand Identity', description: 'Logo, Colors, Typography extracted', icon: Zap },
  { id: 'presence', label: 'Digital Presence', description: 'Social links & meta tags found', icon: Globe },
  { id: 'seo', label: 'SEO Structure', description: 'Keywords & headings mapped', icon: Search },
  { id: 'content', label: 'Content Analysis', description: 'Processing NLP models...', icon: FileText },
  { id: 'conversion', label: 'Conversion', description: 'Analyzing funnel points', icon: BarChart3 },
  { id: 'trust', label: 'Trust & Security', description: 'SSL & Trust signals check', icon: ShieldCheck },
  { id: 'tech', label: 'Tech Stack', description: 'Identifying frameworks & tools', icon: Cpu },
];

const CircularScore = ({ score, label, colorClass }: { score: number, label: string, colorClass: string }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-24 flex items-center justify-center">
        {/* Background Circle */}
        <svg className="size-full -rotate-90" viewBox="0 0 80 80">
          <circle
            className="text-white/5"
            strokeWidth="6"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="40"
            cy="40"
          />
          {/* Progress Circle */}
          <circle
            className={cn("transition-all duration-1000 ease-out", colorClass)}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="40"
            cy="40"
          />
        </svg>
        <span className="absolute text-2xl font-bold text-white">{score}</span>
      </div>
      <span className="text-xs font-medium text-slate-400">{label}</span>
    </div>
  );
};

export default function ProjectsHub() {
  const [url, setUrl] = useState('');
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [loadingTimer, setLoadingTimer] = useState(0);
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { selectProject, refreshProjectsList } = useProject();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoadingProjects) {
      interval = setInterval(() => {
        setLoadingTimer(prev => prev + 0.1);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isLoadingProjects]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (currentUser) {
        setIsLoadingProjects(true);
        setLoadingTimer(0);
        const fetched = await getProjects();
        setProjects(fetched);
        setIsLoadingProjects(false);
      }
    };
    fetchProjects();
  }, [currentUser]);

  const handleRunScan = async () => {
    if (!url) return;
    setIsScanning(true);
    setScanError(null);
    setScanProgress(0);
    setCurrentStepIndex(0);

    let progressInterval: ReturnType<typeof setInterval>;
    let stepInterval: ReturnType<typeof setInterval>;

    try {
      // Start simulated progress for UI feedback
      progressInterval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 90) return prev; // Hold at 90% until complete
          return prev + 1;
        });
      }, 200);

      // Step simulation
      stepInterval = setInterval(() => {
        setCurrentStepIndex(prev => {
          if (prev >= scanSteps.length - 1) return prev;
          return prev + 1;
        });
      }, 1500);

      console.log("-> Pulse.tsx: Calling runFullScan with url:", url);
      const project = await runFullScan(url, currentUser?.uid);
      console.log("-> Pulse.tsx: runFullScan completed. Result:", !!project);

      console.log("-> Pulse.tsx: Calling saveProject...");
      await saveProject(project);
      console.log("-> Pulse.tsx: saveProject completed.");

      // Fire and forget persona auto-extraction
      extractAndSavePersonas(project.id, JSON.stringify(project.sections), currentUser?.uid).catch(console.error);

      clearInterval(progressInterval);
      clearInterval(stepInterval);
      setScanProgress(100);
      setCurrentStepIndex(scanSteps.length);

      // Sincronizar estado global antes de navegar
      await refreshProjectsList();
      await selectProject(project.id);

      setTimeout(() => {
        setIsScanning(false);
        navigate(`/deep-scan/${project.id}`);
      }, 1000);

    } catch (error: any) {
      console.error("Scan failed:", error);
      // Ensure we clear intervals
      clearInterval(progressInterval!);
      clearInterval(stepInterval!);

      // Display the error inline inside the modal so the user actually sees it and the UI isn't stuck holding at 90%
      const errorMsg = error?.message || "An unknown error occurred.";
      setScanError(`Scan failed: ${errorMsg}. Please check the console for more details.`);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t('confirmDeleteScan'))) return;

    try {
      await deleteProject(projectId);
      setProjects(current => current.filter(p => p.id !== projectId));
    } catch (error) {
      console.error("Error deleting project:", error);
      alert(t('deleteScanFailed'));
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-dark">
      {/* Header */}
      <header className="sticky top-0 z-10 px-8 py-6 bg-background-dark/80 backdrop-blur-md flex justify-between items-center border-b border-white/5">
        <div>
          <h2 className="text-white text-2xl font-bold tracking-tight">{t('projectsHub')}</h2>
          <p className="text-slate-400 text-sm mt-1 flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500"></span>
            {t('projectsHubSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <Bell className="size-5" />
          </button>
          <button className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <Settings className="size-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-5xl mx-auto w-full space-y-12 pb-20">

          {/* Section A: Start a Marketing Scan */}
          <section className="flex flex-col items-center justify-center space-y-8 py-8">
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-bold text-white tracking-tight">{t('startMarketingScan')}</h1>
              <p className="text-slate-400 text-lg">{t('scanSubtitle')}</p>
            </div>

            <div className="w-full max-w-2xl space-y-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative flex items-center bg-surface-dark border border-white/10 rounded-xl p-2 shadow-2xl transition-all focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10">
                  <div className="pl-4 pr-3 text-slate-500">
                    <LinkIcon className="size-5" />
                  </div>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunScan()}
                    placeholder={t('scanPlaceholder')}
                    className="flex-1 bg-transparent border-none text-white text-lg placeholder:text-slate-600 focus:outline-none focus:ring-0 py-2"
                  />
                  <button
                    onClick={handleRunScan}
                    disabled={isScanning}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isScanning ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
                    {t('runScan')}
                  </button>
                </div>
              </div>

              {/* Accordion */}
              <div className="bg-surface-dark border border-white/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                  className="w-full px-5 py-3 flex items-center justify-between text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
                >
                  <div className="flex items-center gap-2">
                    <Info className="size-4 text-blue-500" />
                    {t('whatYouGet')}
                  </div>
                  <ChevronDown className={cn("size-4 transition-transform duration-200", isAccordionOpen && "rotate-180")} />
                </button>

                {isAccordionOpen && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/5 bg-white/[0.02]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                      <div>
                        <h4 className="text-white font-medium mb-2">{t('strategicOutputs')}</h4>
                        <ul className="space-y-1.5 text-slate-400">
                          <li className="flex items-center gap-2"><div className="size-1 rounded-full bg-blue-500"></div>{t('scanOutputExecutiveSummary')}</li>
                          <li className="flex items-center gap-2"><div className="size-1 rounded-full bg-blue-500"></div>{t('scanOutputSnapshot')}</li>
                          <li className="flex items-center gap-2"><div className="size-1 rounded-full bg-blue-500"></div>{t('scanOutputFootprint')}</li>
                          <li className="flex items-center gap-2"><div className="size-1 rounded-full bg-blue-500"></div>{t('scanOutputActionPlan')}</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-white font-medium mb-2">{t('technicalAnalysis')}</h4>
                        <ul className="space-y-1.5 text-slate-400">
                          <li className="flex items-center gap-2"><div className="size-1 rounded-full bg-emerald-500"></div>{t('scanOutputSeo')}</li>
                          <li className="flex items-center gap-2"><div className="size-1 rounded-full bg-emerald-500"></div>{t('scanOutputConversion')}</li>
                          <li className="flex items-center gap-2"><div className="size-1 rounded-full bg-emerald-500"></div>{t('scanOutputTechStack')}</li>
                          <li className="flex items-center gap-2"><div className="size-1 rounded-full bg-emerald-500"></div>{t('scanOutputPerformance')}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

          {/* Section B: Your Projects */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">{t('yourProjects')}</h3>
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white bg-surface-dark border border-white/10 rounded-lg transition-colors">
                {t('sortByRecent')}
                <Filter className="size-3" />
              </button>
            </div>

            {isLoadingProjects ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative size-16 flex items-center justify-center mb-4">
                  <svg className="size-full animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeDasharray="30 60" strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{loadingTimer.toFixed(1)}s</span>
                  </div>
                </div>
                <p className="text-slate-400 font-medium">{t('syncingDatabase')}</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p>{t('noProjectsYet')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <div key={project.id} className="group relative bg-background-dark border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all duration-500 hover:shadow-2xl hover:shadow-black/50 flex flex-col overflow-hidden">

                    {/* Background Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10 flex flex-col items-start mb-6">
                      <div className="flex items-center justify-between w-full mb-4">
                        <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold text-slate-300 uppercase tracking-wider backdrop-blur-md">
                          {project.niche}
                        </span>
                        <button
                          onClick={(e) => handleDeleteProject(project.id, e)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-lg z-20"
                          title="Delete Scan"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      <h4 className="text-2xl font-bold text-white tracking-tight mb-1">{project.name}</h4>
                      <a href={project.url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-1 mb-4">
                        {project.url.replace(/^https?:\/\//, '')}
                      </a>

                      <p className="text-sm text-slate-400 line-clamp-3 mb-2 min-h-[60px]">
                        {project.description || t('noDescription')}
                      </p>
                    </div>

                    <div className="relative z-10 grid grid-cols-2 gap-4 mb-8">
                      <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/[0.02] border border-white/5 group-hover:bg-white/[0.04] transition-colors">
                        <span className="text-3xl font-bold text-emerald-500">{project.scores.website}</span>
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mt-1">Website</span>
                      </div>
                      <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/[0.02] border border-white/5 group-hover:bg-white/[0.04] transition-colors">
                        <span className="text-3xl font-bold text-blue-500">{project.scores.marketing}</span>
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mt-1">Marketing</span>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(`/deep-scan/${project.id}`)}
                      className="relative z-10 mt-auto w-full py-3.5 bg-white text-black hover:bg-slate-200 font-semibold rounded-xl text-sm transition-all shadow-lg shadow-white/5 flex items-center justify-center gap-2 group-hover:scale-[1.02]"
                    >
                      {t('viewFullReport')}
                      <ChevronDown className="size-4 -rotate-90" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Scan Progress Modal */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-background-dark border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("size-2 rounded-full", scanError ? "bg-red-500" : "bg-blue-500 animate-pulse")} />
                  <span className={cn("text-xs font-bold tracking-wider", scanError ? "text-red-500" : "text-blue-500")}>
                    {scanError ? t('scanFailed') : t('scanActive')}
                  </span>
                </div>
                <button onClick={() => setIsScanning(false)} className="text-slate-500 hover:text-white transition-colors">
                  <X className="size-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 overflow-y-auto">
                <div>
                  <h3 className="text-lg font-bold text-white">{t('analyzingUrl')}</h3>
                  <p className="text-slate-400 text-sm truncate">{url}</p>
                </div>

                {scanError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-1">
                    <h4 className="text-red-500 font-bold mb-1">{t('errorDuringScan')}</h4>
                    <p className="text-sm text-red-200">{scanError}</p>
                  </div>
                )}

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-300">{t('overallProgress')}</span>
                    <span className="text-blue-400">{Math.round(scanProgress)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-blue-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${scanProgress}%` }}
                      transition={{ ease: "linear" }}
                    />
                  </div>
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  {scanSteps.map((step, index) => {
                    const status = index < currentStepIndex ? 'completed' : index === currentStepIndex ? 'active' : 'pending';
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-xl border transition-all duration-300",
                          status === 'active' ? "bg-blue-500/10 border-blue-500/20" : "bg-transparent border-transparent"
                        )}
                      >
                        <div className={cn(
                          "size-8 rounded-full flex items-center justify-center shrink-0 border",
                          scanError && status === 'active' ? "bg-red-500/20 border-red-500/20 text-red-500" :
                            status === 'completed' ? "bg-green-500/20 border-green-500/20 text-green-500" :
                              status === 'active' ? "bg-blue-500/20 border-blue-500/20 text-blue-500" :
                                "bg-white/5 border-white/5 text-slate-600"
                        )}>
                          {scanError && status === 'active' ? <X className="size-4" /> :
                            status === 'completed' ? <CheckCircle2 className="size-4" /> :
                              status === 'active' ? <Loader2 className="size-4 animate-spin" /> :
                                <step.icon className="size-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={cn("text-sm font-medium", status === 'pending' ? "text-slate-500" : "text-white")}>
                            {step.label}
                          </h4>
                          {status === 'active' && (
                            <p className="text-xs text-blue-400 mt-0.5 animate-pulse">{step.description}</p>
                          )}
                          {status === 'completed' && (
                            <p className="text-xs text-slate-500 mt-0.5">{t('completed')}</p>
                          )}
                        </div>
                        {status === 'completed' && <CheckCircle2 className="size-4 text-green-500" />}
                        {status === 'active' && <div className="size-2 rounded-full bg-blue-500 animate-pulse" />}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/5 bg-white/[0.02] flex justify-end items-center">
                <button onClick={() => setIsScanning(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-lg border border-white/10 transition-colors">
                  {t('cancelScan')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
