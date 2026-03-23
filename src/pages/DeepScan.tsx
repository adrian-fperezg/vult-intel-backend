import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Download,
  Share2,
  ChevronRight,
  LayoutDashboard,
  Target,
  Users,
  Megaphone,
  Network,
  FileText,
  Search,
  MousePointerClick,
  Cpu,
  Zap,
  CalendarCheck,
  ChevronDown,
  Copy,
  Check,
  Filter,
  CheckSquare,
  Square,
  RefreshCw,
  Loader2,
  FileDown,
  Clock,
  Compass,
  Globe,
  Link as LinkIcon,
  Plus
} from 'lucide-react';
import { exportToDocx } from '@/utils/docxExport';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { getProjectById, getProjects, updateProject, runFullScan, saveProject, Project, MarketingTask } from '@/services/scanService';
import { logDeepScanRun } from '@/services/analytics';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { extractAndSavePersonas, validateQuota } from '@/services/ai';
import { useUserMetrics } from '@/hooks/useUserMetrics';

// Score Ring Component
const ScoreRing = ({ score, label, colorClass }: { score: number, label: string, colorClass: string }) => {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-surface-dark border border-white/5 hover:bg-white/[0.02] transition-colors">
      <div className="relative size-20 flex items-center justify-center">
        <svg className="size-full -rotate-90 drop-shadow-xl" viewBox="0 0 72 72">
          <circle
            className="text-white/[0.03]"
            strokeWidth="6"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="36"
            cy="36"
          />
          <circle
            className={cn("transition-all duration-1000 ease-out", colorClass)}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="36"
            cy="36"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white tracking-tighter">{score}</span>
        </div>
      </div>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );
};

export default function FullScanReport() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingTimer, setLoadingTimer] = useState(0);
  const { activeProjectId, projects: allProjects, refreshProjectsList } = useProject();
  const { currentUser } = useAuth();
  const { totalLimits, metrics } = useUserMetrics();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingTimer(prev => prev + 0.1);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const [activeSection, setActiveSection] = useState<string>('marketing-checklist');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'marketing-checklist': true,
    'executive-summary': true,
    'business-snapshot': true,
    'audience-and-positioning': true,
    'action-plan30-days': true
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isReAnalyzing, setIsReAnalyzing] = useState(false);
  const [selectedSitePage, setSelectedSitePage] = useState<number>(0);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleReAnalyze = async () => {
    if (!project) return;
    setIsLoading(true);
    setLoadingTimer(0);

    const totalTokensUsed = metrics.tokensUsed || 0;
    const tokensRemaining = (totalLimits.tokens || 500000) - totalTokensUsed;

    try {
      validateQuota(tokensRemaining, currentUser?.email);
      logDeepScanRun(project.url, project.region || 'Global');
      const newProject = await runFullScan(project.url, currentUser?.uid);

      // Preserve manually added competitors
      newProject.competitors = project.competitors && project.competitors.length > 0
        ? Array.from(new Set([...(newProject.competitors || []), ...project.competitors]))
        : newProject.competitors;

      saveProject(newProject);
      refreshProjectsList(); // Sync global dropdown
      setProject(newProject);

      navigate(`/deep-scan/${newProject.id}`, { replace: true });
      setToastMessage("Analysis updated successfully based on competitors");
    } catch (error) {
      console.error("Re-analysis failed:", error);
      setToastMessage("Re-analysis failed");
    } finally {
      setIsReAnalyzing(false);
    }
  };

  const handleAddCompetitor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompetitor.trim() || !project) return;

    // Add to project locally and save
    const updatedCompetitors = [...(project.competitors || []), newCompetitor.trim()];
    const updatedProject = { ...project, competitors: Array.from(new Set(updatedCompetitors)) };

    setProject(updatedProject);
    updateProject(updatedProject);
    setNewCompetitor('');
    setIsAddingCompetitor(false);
    setToastMessage("Competitor added. Click 'Re-Analyze' to update the report.");
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setLoadingTimer(0);
      // Removed local project fetching in favor of context-managed 'allProjects'

      if (projectId) {
        const foundProject = await getProjectById(projectId);
        if (foundProject) {
          setProject(foundProject);
        } else {
          console.error("Project not found");
        }
      } else if (allProjects.length > 0) {
        setProject(allProjects[0]);
        navigate(`/deep-scan/${allProjects[0].id}`, { replace: true });
      }
      setIsLoading(false);
    };
    loadData();
  }, [projectId, navigate, allProjects]);

  useEffect(() => {
    if (activeProjectId && projectId && activeProjectId !== projectId) {
      navigate(`/deep-scan/${activeProjectId}`, { replace: true });
    }
  }, [activeProjectId, projectId, navigate]);

  useEffect(() => {
    if (isLoading || !project || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;

    // Track all section entries; pick the topmost intersecting one
    const sectionMap = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          sectionMap.set(entry.target.id, entry.boundingClientRect.top);
        });
        // Find the section closest to the top of the viewport (smallest positive top)
        let best: string | null = null;
        let bestTop = Infinity;
        sectionMap.forEach((top, id) => {
          const el = document.getElementById(id);
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const relTop = rect.top - containerRect.top;
          if (relTop >= -80 && relTop < bestTop) {
            bestTop = relTop;
            best = id;
          }
        });
        if (best) setActiveSection(best);
      },
      {
        root: container,
        rootMargin: '0px 0px -60% 0px',
        threshold: 0
      }
    );

    // Observe checklist
    const checklist = document.getElementById('marketing-checklist');
    if (checklist) observer.observe(checklist);

    // Observe all dynamic sections
    project.sections.forEach(section => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isLoading, project]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      // scrollIntoView respects scroll-margin-top set on the element
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleTaskToggle = (taskId: string) => {
    if (!project) return;

    const updatedChecklist = project.marketingChecklist.map(task =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );

    const updatedProject = { ...project, marketingChecklist: updatedChecklist };
    setProject(updatedProject);
    updateProject(updatedProject);
  };

  const handleCopySection = (content: string) => {
    navigator.clipboard.writeText(content);
    setToastMessage("Section content copied to clipboard");
  };

  const handleExportToDocs = async () => {
    if (!project) return;

    setToastMessage("Generating Document...");

    // Build the Document Markdown String
    let mdStr = `# Vult Intel DeepScan Report\n\n`;
    mdStr += `**Company:** ${project.name}\n\n`;
    mdStr += `**Domain:** ${project.url}\n\n`;
    mdStr += `**Niche:** ${project.niche}\n\n`;
    mdStr += `**Region:** ${project.region}\n\n`;
    mdStr += `**Description:** ${project.description}\n\n`;

    mdStr += `## Scores\n\n`;
    mdStr += `- Website Performance: ${project.scores.website}/100\n`;
    mdStr += `- Marketing Maturity: ${project.scores.marketing}/100\n\n`;

    if (project.competitors && project.competitors.length > 0) {
      mdStr += `## Competitors Monitored\n\n`;
      project.competitors.forEach(comp => {
        mdStr += `- ${comp}\n`;
      });
      mdStr += `\n`;
    }

    if (project.marketingChecklist && project.marketingChecklist.length > 0) {
      mdStr += `## Marketing Action Checklist\n\n`;
      project.marketingChecklist.forEach(task => {
        const status = task.completed ? '[x]' : '[ ]';
        mdStr += `- ${status} **${task.category}** (${task.impact} Impact) - ${task.task}\n`;
      });
      mdStr += `\n`;
    }

    // Process all dynamic sections
    project.sections.forEach(sec => {
      mdStr += `## ${sec.title}\n\n`;
      if (sec.summary) {
        mdStr += `*${sec.summary}*\n\n`;
      }
      if (sec.content) {
        mdStr += `${sec.content}\n\n`;
      }

      // Handle the nested 'pages' if it's the SEO section
      if (sec.pages && sec.pages.length > 0) {
        sec.pages.forEach(page => {
          mdStr += `### Page: ${page.path} (${page.type})\n\n`;
          mdStr += `${page.seoReport}\n\n`;
        });
      }
    });

    try {
      const safeFilename = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_DeepScan`;
      await exportToDocx(mdStr, safeFilename);
      setToastMessage("Document downloaded successfully.");
    } catch (e: any) {
      setToastMessage("Error exporting document.");
    }
  };

  const handleShareReport = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setToastMessage("Report URL copied to clipboard");
  };

  if (isLoading || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background-dark">
        <div className="relative size-24 flex items-center justify-center mb-6">
          <svg className="size-full animate-spin text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="30 60" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-sm font-bold tracking-wider">{loadingTimer.toFixed(1)}s</span>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Decrypting Data</h2>
        <p className="text-sm text-slate-400 border border-white/10 px-4 py-2 rounded-full bg-white/5 shadow-inner">
          Connecting to the neural network...
        </p>
      </div>
    );
  }

  const sections = project.sections.map(section => {
    let icon = LayoutDashboard;
    switch (section.id) {
      case 'marketing-improvements': icon = CheckSquare; break;
      case 'executive-summary': icon = LayoutDashboard; break;
      case 'business-snapshot': icon = Target; break;
      case 'audience-and-positioning': icon = Users; break;
      case 'channels-and-presence': icon = Megaphone; break;
      case 'site-architecture': icon = Network; break;
      case 'discovered-pages-and-seo-audit': icon = Search; break;
      case 'content-audit': icon = FileText; break;
      case 'seo-performance': icon = Compass; break;
      case 'conversion-and-ux': icon = MousePointerClick; break;
      case 'tech-stack': icon = Cpu; break;
      case 'quick-wins7-days': icon = Zap; break;
      case 'action-plan30-days': icon = CalendarCheck; break;
      default: icon = FileText; break;
    }
    return { ...section, icon };
  });

  // Preprocesses AI content: promotes short standalone lines (section labels) to ## headings
  const preprocessMarkdown = (text: string): string => {
    if (!text) return text;
    return text
      .split('\n')
      .map((line, i, lines) => {
        const trimmed = line.trim();
        // Already a heading
        if (trimmed.startsWith('#')) return line;
        // Short line (2-6 words), not bold, not empty, followed by content → treat as heading
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        const prevEmpty = i === 0 || lines[i - 1].trim() === '';
        const nextHasContent = i < lines.length - 1 && lines[i + 1].trim() !== '';
        if (
          prevEmpty &&
          nextHasContent &&
          wordCount >= 1 &&
          wordCount <= 6 &&
          !trimmed.startsWith('**') &&
          !trimmed.startsWith('-') &&
          !trimmed.startsWith('•') &&
          !trimmed.startsWith('*') &&
          !trimmed.match(/^\d+\./) &&
          trimmed.length > 0
        ) {
          return `## ${trimmed}`;
        }
        return line;
      })
      .join('\n');
  };

  // Custom ReactMarkdown components for rich visual hierarchy
  const mdComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="text-2xl font-black text-white mt-8 mb-4 pb-2 border-b border-white/10 tracking-tight flex items-center gap-2">
        <span className="w-1 h-6 rounded-full bg-blue-500 inline-block shrink-0" />
        {children}
      </h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="text-lg font-bold text-white mt-7 mb-3 flex items-center gap-2">
        <span className="w-0.5 h-4 rounded-full bg-blue-400/60 inline-block shrink-0" />
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-sm font-semibold text-slate-200 mt-5 mb-2 uppercase tracking-wider">{children}</h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className="text-sm font-bold text-blue-300 mt-4 mb-1.5">{children}</h4>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-slate-300 text-sm leading-7 mb-4">{children}</p>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-bold text-white">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="italic text-slate-200 not-italic" style={{ fontStyle: 'italic' }}>{children}</em>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="space-y-2 my-4 ml-1">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="space-y-2 my-4 ml-1 list-none counter-reset-item">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="flex gap-3 items-start text-slate-300 text-sm leading-6">
        <span className="mt-2 size-1.5 rounded-full bg-blue-400 shrink-0" />
        <span>{children}</span>
      </li>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-2 border-blue-500/50 pl-4 my-4 bg-blue-500/5 rounded-r-lg py-2 pr-3">
        <span className="text-blue-200/80 text-sm italic">{children}</span>
      </blockquote>
    ),
    hr: () => (
      <hr className="border-none h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent my-6" />
    ),
    code: ({ children }: { children?: React.ReactNode }) => (
      <code className="px-1.5 py-0.5 rounded bg-white/10 text-blue-300 text-sm font-mono">{children}</code>
    ),
  } as import('react-markdown').Components;

  return (
    <div className="flex flex-col h-full bg-background-dark overflow-hidden print:overflow-visible print:h-auto print:bg-white">
      <style>{`
        @media print {
          @page { margin: 20mm; size: auto; }
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
          #root, .flex-col, .flex-1 { display: block !important; height: auto !important; overflow: visible !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:bg-white { background-color: white !important; }
          .print\\:text-black { color: black !important; }
          .print\\:border-black { border-color: black !important; }
          /* Force typography to be readable, black, and well-spaced */
          .prose { max-width: 100% !important; color: black !important; }
          .prose * { color: black !important; }
          .prose h1, .prose h2, .prose h3 { margin-top: 1.5rem !important; margin-bottom: 0.75rem !important; page-break-after: avoid; }
          .prose p, .prose li { line-height: 1.6 !important; font-size: 11pt !important; margin-bottom: 0.5rem !important; }
          .prose pre, .prose code { background: #f1f5f9 !important; border: 1px solid #e2e8f0 !important; color: #0f172a !important; }
          /* Hide scrollbars */
          ::-webkit-scrollbar { display: none; }
        }
      `}</style>

      {/* Print-Only Header */}
      <div className="hidden print:block mb-8 pb-4 border-b-2 border-slate-200">
        <h1 className="text-3xl font-bold text-black mb-2">{project.name}</h1>
        <div className="text-sm font-medium text-slate-600 space-y-1">
          <p><strong>URL:</strong> {project.url}</p>
          <p><strong>Date:</strong> {new Date(project.lastScan).toLocaleDateString()}</p>
          <p><strong>Niche:</strong> {project.niche} | <strong>Region:</strong> {project.region || 'Global'}</p>
        </div>
      </div>
      <header className="shrink-0 px-8 py-8 bg-background-dark border-b border-white/5 z-20 print:hidden">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
            <div className="flex items-start gap-8">
              <div className="space-y-4">
                <h1 className="text-4xl font-bold text-white tracking-tight">{project.name}</h1>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="size-3.5" />
                      {project.niche}
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="size-3.5" />
                      {project.region || 'Global Market'}
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {new Date(project.lastScan).toLocaleDateString()}
                    </span>
                  </div>

                  <a href={project.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-2 w-fit group">
                    <LinkIcon className="size-4 group-hover:-rotate-45 transition-transform text-slate-500 group-hover:text-blue-400" />
                    {project.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </div>

                <div className="relative mt-4 flex items-center gap-3">
                  <button
                    onClick={handleReAnalyze}
                    disabled={isReAnalyzing}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isReAnalyzing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                    {isReAnalyzing ? 'Analyzing...' : 'Re-Analyze'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-10">
              {/* Score Rings Side-By-Side */}
              <div className="flex items-center gap-4 pr-0 lg:pr-10 border-b lg:border-b-0 lg:border-r border-white/10 pb-6 lg:pb-0 w-full lg:w-auto">
                <ScoreRing score={project.scores.website} label="Website" colorClass="text-emerald-500" />
                <ScoreRing score={project.scores.marketing} label="Marketing" colorClass="text-blue-500" />
              </div>

              {/* Competitors List & Add Button */}
              <div className="flex flex-col gap-3 min-w-[200px] w-full lg:w-auto pr-0 lg:pr-10 border-b lg:border-b-0 lg:border-r border-white/10 pb-6 lg:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Compared Against</span>
                  {!isAddingCompetitor && (
                    <button
                      onClick={() => setIsAddingCompetitor(true)}
                      className="text-xs flex items-center gap-1 font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider transition-colors"
                    >
                      <Plus className="size-3" /> Add
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {project.competitors && project.competitors.length > 0 ? (
                    project.competitors.map((comp, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                        <Target className="size-3 text-emerald-500 shrink-0" />
                        <span className="truncate max-w-[150px]">{comp.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 italic">No competitors tracked.</span>
                  )}
                </div>

                {/* Add Competitor Input */}
                <AnimatePresence>
                  {isAddingCompetitor && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-1"
                    >
                      <form onSubmit={handleAddCompetitor} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="competitor.com"
                          value={newCompetitor}
                          onChange={(e) => setNewCompetitor(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                          autoFocus
                        />
                        <button type="submit" className="shrink-0 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors">
                          <Check className="size-3" />
                        </button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 w-full lg:w-auto">
                <button
                  onClick={handleExportToDocs}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-all shadow-lg shadow-white/5 text-sm active:scale-95"
                >
                  <FileDown className="size-4" />
                  Exportar
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto print:overflow-visible"
        id="report-container"
      >
        <div className="flex gap-0 max-w-7xl mx-auto w-full min-h-full print:block">
          {/* Report Body */}
          <div className="flex-1 min-w-0 px-8 py-8 space-y-8 pb-28 print:pb-0 print:px-0">
            {/* Marketing Checklist Section */}
            {project.marketingChecklist && project.marketingChecklist.length > 0 && (
              <div id="marketing-checklist" style={{ scrollMarginTop: '2rem' }} className="bg-surface-dark border border-white/10 rounded-3xl overflow-hidden transition-all duration-300 hover:border-white/20 print:border-none print:bg-transparent print:mb-8">
                <button
                  onClick={() => toggleSection('marketing-checklist')}
                  className="w-full px-8 py-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors print:px-0 print:py-2 print:pointer-events-none"
                >
                  <div className="flex items-center gap-5">
                    <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500 ring-1 ring-purple-500/20 print:hidden">
                      <CheckSquare className="size-6" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-xl font-bold text-white print:text-black">Marketing Improvements Checklist</h3>
                      <p className="text-base text-slate-400 mt-1 print:text-slate-600 print:hidden">Track your progress on high-impact tasks.</p>
                    </div>
                  </div>
                  <ChevronDown className={cn("size-5 text-slate-500 transition-transform duration-300 print:hidden", expandedSections['marketing-checklist'] && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {expandedSections['marketing-checklist'] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="print:!h-auto print:!opacity-100"
                    >
                      <div className="px-8 pb-8 pt-2 border-t border-white/5 print:px-0 print:border-t-2 print:border-black print:pt-4">
                        <div className="space-y-3">
                          {project.marketingChecklist.map((task) => (
                            <div
                              key={task.id}
                              className={cn(
                                "flex items-start gap-4 p-4 rounded-xl border transition-all duration-200",
                                task.completed
                                  ? "bg-emerald-500/5 border-emerald-500/20 print:border-black/20"
                                  : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] print:border-black/20 print:bg-transparent"
                              )}
                            >
                              <button
                                onClick={() => handleTaskToggle(task.id)}
                                className={cn(
                                  "mt-0.5 shrink-0 transition-colors print:pointer-events-none",
                                  task.completed ? "text-emerald-500" : "text-slate-500 hover:text-white"
                                )}
                              >
                                {task.completed ? <CheckSquare className="size-5" /> : <Square className="size-5" />}
                              </button>
                              <div className="flex-1">
                                <p className={cn(
                                  "text-sm font-medium transition-colors",
                                  task.completed ? "text-emerald-400 line-through decoration-emerald-500/50" : "text-slate-200 print:text-black"
                                )}>
                                  {task.task}
                                </p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500 bg-white/5 px-2.5 py-1 rounded border border-white/5">
                                    {task.category}
                                  </span>
                                  <span className={cn(
                                    "text-xs font-medium uppercase tracking-wider px-2.5 py-1 rounded border",
                                    task.impact === 'High' ? "text-rose-400 bg-rose-500/10 border-rose-500/20" :
                                      task.impact === 'Medium' ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                                        "text-blue-400 bg-blue-500/10 border-blue-500/20"
                                  )}>
                                    {task.impact} Impact
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {sections.map((section) => (
              <div
                key={section.id}
                id={section.id}
                style={{ scrollMarginTop: '2rem' }}
                className="bg-surface-dark border border-white/10 rounded-3xl overflow-hidden transition-all duration-300 hover:border-white/20 print:border-none print:bg-transparent print:break-inside-avoid print:mb-8"
              >
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full px-8 py-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors print:px-0 print:py-2 print:pointer-events-none print:border-b-2 print:border-black print:mb-4"
                >
                  <div className="flex items-center gap-5">
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 ring-1 ring-blue-500/20 print:hidden">
                      <section.icon className="size-6" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-xl font-bold text-white print:text-black">{section.title}</h3>
                      <p className="text-sm text-slate-400 mt-1 print:text-slate-600 print:hidden">{section.summary}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border print:hidden",
                      "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                    )}>
                      Analysis Ready
                    </span>
                    <ChevronDown className={cn("size-5 text-slate-500 transition-transform duration-300 print:hidden", expandedSections[section.id] && "rotate-180")} />
                  </div>
                </button>

                <AnimatePresence>
                  {expandedSections[section.id] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="print:!h-auto print:!opacity-100"
                    >
                      <div className="px-8 pb-8 pt-2 border-t border-white/5 print:border-none print:px-0 print:pt-0 print:pb-0">
                        {section.id === 'site-pages' && section.pages && section.pages.length > 0 ? (
                          <div className="flex flex-col gap-6">
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between print:hidden">
                              <p className="text-sm text-slate-400">Select a discovered page to view its dedicated SEO report.</p>
                              <div className="relative">
                                <select
                                  value={selectedSitePage}
                                  onChange={(e) => setSelectedSitePage(Number(e.target.value))}
                                  className="appearance-none bg-background-dark border border-white/10 rounded-lg pl-4 pr-10 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 min-w-[200px]"
                                >
                                  {/* Sort pages where New (<= 5 days) are first */}
                                  {[...section.pages].sort((a, b) => {
                                    const aIsNew = (new Date().getTime() - new Date(a.discoveryDate).getTime()) / (1000 * 3600 * 24) <= 5;
                                    const bIsNew = (new Date().getTime() - new Date(b.discoveryDate).getTime()) / (1000 * 3600 * 24) <= 5;
                                    if (aIsNew && !bIsNew) return -1;
                                    if (!aIsNew && bIsNew) return 1;
                                    return 0;
                                  }).map((page, idx) => {
                                    const isNew = (new Date().getTime() - new Date(page.discoveryDate).getTime()) / (1000 * 3600 * 24) <= 5;
                                    // Let's find its original index to map properly back to selection
                                    const originalIdx = section.pages.findIndex(p => p.path === page.path);
                                    return (
                                      <option key={idx} value={originalIdx}>
                                        {isNew ? '🔥 NEW: ' : ''}{page.path || "Homepage"} ({page.type})
                                      </option>
                                    );
                                  })}
                                </select>
                                <ChevronDown className="absolute right-3 top-2.5 size-4 text-slate-500 pointer-events-none" />
                              </div>
                            </div>
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 print:bg-transparent print:border-none print:p-0">
                              <div className="space-y-0">
                                <ReactMarkdown 
                                  rehypePlugins={[rehypeSanitize]} 
                                  components={mdComponents}
                                >
                                  {preprocessMarkdown(section.pages[selectedSitePage].seoReport || 'No detailed report available for this page.')}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="prose prose-invert max-w-none">
                            {section.content && section.content.trim() && section.content !== "_No data detected during this scan._" ? (
                               <ReactMarkdown 
                                 rehypePlugins={[rehypeSanitize]} 
                                 components={mdComponents}
                               >
                                 {preprocessMarkdown(section.content)}
                               </ReactMarkdown>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                                <div className="size-12 rounded-full bg-slate-500/10 flex items-center justify-center mb-4">
                                  <Search className="size-6 text-slate-500/50" />
                                </div>
                                <p className="text-slate-400 text-sm font-medium">No specific data detected for this section during this scan.</p>
                                <p className="text-slate-500 text-xs mt-1">Try running a Re-Analysis with more competitor context.</p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-8 flex justify-end print:hidden">
                          <button
                            onClick={() => handleCopySection(section.content)}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors border border-white/5"
                          >
                            <Copy className="size-3.5" />
                            Copy Section
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Table of Contents */}
          <div className="hidden lg:block shrink-0 w-72 border-l border-white/5 bg-background-dark print:hidden">
            <div className="sticky top-8 py-8 px-5 max-h-[calc(100vh-8rem)] overflow-y-auto">
              <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-2 mb-5">
                Table of Contents
              </h4>
              <nav className="space-y-0.5">
                {/* Marketing Improvements Checklist */}
                {project.marketingChecklist && project.marketingChecklist.length > 0 && (
                  <button
                    onClick={() => scrollToSection('marketing-checklist')}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left group relative",
                      activeSection === 'marketing-checklist'
                        ? "bg-blue-500/10 text-blue-400"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {activeSection === 'marketing-checklist' && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-full" />
                    )}
                    <CheckSquare className={cn(
                      "size-3.5 shrink-0 transition-colors",
                      activeSection === 'marketing-checklist' ? "text-blue-500" : "text-slate-600 group-hover:text-slate-400"
                    )} />
                    <span className="truncate leading-tight">Marketing Improvements Checklist</span>
                  </button>
                )}

                {/* Dynamic report sections */}
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left group relative",
                      activeSection === section.id
                        ? "bg-blue-500/10 text-blue-400"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {activeSection === section.id && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-full" />
                    )}
                    <section.icon className={cn(
                      "size-3.5 shrink-0 transition-colors",
                      activeSection === section.id ? "text-blue-500" : "text-slate-600 group-hover:text-slate-400"
                    )} />
                    <span className="truncate leading-tight">{section.title}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-surface-dark border border-white/10 rounded-full shadow-2xl flex items-center gap-3"
          >
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-white">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
