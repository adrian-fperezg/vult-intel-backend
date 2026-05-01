import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Activity,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lock,
  RefreshCcw,
  Calendar
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface RoadmapItem {
  id: string;
  title: string;
  urgency: 'RED' | 'ORANGE' | 'BLUE';
  dueDate: string;
  summary: string;
  fullContext: string;
  action: string[];
}

interface DashboardData {
  success: boolean;
  data: RoadmapItem[];
  metadata: {
    lastUpdated: string;
    totalTasks: number;
    criticalTasks: number;
  };
}

export default function AdminDashboard() {
  const { isFounder, currentUser } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const fetchRoadmap = async () => {
    setIsLoading(true);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/admin/roadmap', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch roadmap data');
      }
      
      const json = await response.json();
      setData(json);
    } catch (error) {
      console.error('[ADMIN_ROADMAP_FETCH]', error);
      toast.error('Failed to load admin roadmap');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isFounder) {
      fetchRoadmap();
    }
  }, [isFounder]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const handleViewRaw = async (file: 'roadmap' | 'security') => {
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch(`/api/admin/roadmap/raw/${file}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch file');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Cleanup URL after some time
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error('Failed to open secure document');
    }
  };

  if (!isFounder) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="size-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
          <Lock className="size-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Access Restricted</h1>
        <p className="text-slate-400 max-w-md">
          This portal is reserved for platform administrators only. If you believe this is an error, please contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 lg:p-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Shield className="size-6 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Platform Admin Portal</h1>
          </div>
          <p className="text-slate-400 font-medium">Strategic Roadmap & Security Protocol Enforcement</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {data?.metadata.lastUpdated && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <Clock className="size-3.5 text-slate-500" />
              <span className="text-xs text-slate-500 font-medium tabular-nums">
                Last updated: {new Date(data.metadata.lastUpdated).toLocaleTimeString()}
              </span>
            </div>
          )}
          <button 
            onClick={fetchRoadmap}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-all group"
          >
            <RefreshCcw className={cn("size-4 text-slate-400 group-hover:text-white transition-all", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl bg-surface-dark/50 border border-surface-border backdrop-blur-xl relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none">
            <Activity className="size-24 text-white" />
          </div>
          <div className="space-y-4">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total Active Tasks</p>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-white">{data?.metadata.totalTasks || 0}</span>
              <span className="text-sm text-blue-400 font-semibold flex items-center gap-1">
                Roadmap v3.1 <ArrowUpRight className="size-3" />
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 backdrop-blur-xl relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity pointer-events-none">
            <AlertTriangle className="size-24 text-red-500" />
          </div>
          <div className="space-y-4">
            <p className="text-sm font-bold text-red-400/70 uppercase tracking-wider">Critical Priority</p>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-red-500">{data?.metadata.criticalTasks || 0}</span>
              <span className="text-sm text-red-400/60 font-semibold">Immediate Action Required</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-6 rounded-2xl bg-teal-500/5 border border-teal-500/20 backdrop-blur-xl relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-8 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity pointer-events-none">
            <Shield className="size-24 text-teal-500" />
          </div>
          <div className="space-y-4">
            <p className="text-sm font-bold text-teal-400/70 uppercase tracking-wider">Security Protocol</p>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-teal-500">Active</span>
              <span className="text-sm text-teal-400/60 font-semibold flex items-center gap-1">
                L4 Monitoring <CheckCircle2 className="size-3" />
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Roadmap Items Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[200px] rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
            ))
          ) : (
            data?.data.map((item, index) => (
              <motion.div
                layout
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "p-6 rounded-2xl border backdrop-blur-md flex flex-col gap-6 group transition-all duration-300",
                  item.urgency === 'RED' 
                    ? "bg-red-500/[0.03] border-red-500/20 hover:border-red-500/40" 
                    : item.urgency === 'ORANGE'
                      ? "bg-orange-500/[0.03] border-orange-500/20 hover:border-orange-500/40"
                      : "bg-blue-500/[0.03] border-blue-500/20 hover:border-blue-500/40"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider",
                        item.urgency === 'RED' 
                          ? "bg-red-500 text-white" 
                          : item.urgency === 'ORANGE'
                            ? "bg-orange-500 text-white"
                            : "bg-blue-500 text-white"
                      )}>
                        {item.urgency}
                      </span>
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                        <Calendar className="size-3" />
                        Due: {item.dueDate}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors leading-tight">
                      {item.title}
                    </h3>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-slate-400 text-[15px] leading-relaxed">
                    {item.summary}
                  </p>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-white transition-colors w-fit"
                    >
                      {expandedItems.has(item.id) ? (
                        <>Collapse Context <ChevronUp className="size-4" /></>
                      ) : (
                        <>View Full Context <ChevronDown className="size-4" /></>
                      )}
                    </button>

                    <AnimatePresence>
                      {expandedItems.has(item.id) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden space-y-4"
                        >
                          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-slate-300 leading-relaxed italic">
                            "{item.fullContext}"
                          </div>

                          <div className="space-y-2.5">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                              <Lock className="size-3" /> Action Items
                            </h4>
                            <ul className="space-y-2">
                              {item.action.map((action, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-slate-400 group/item">
                                  <div className="size-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0 group-hover/item:bg-primary transition-colors" />
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    <div className="size-7 rounded-full bg-surface-border border-2 border-[#12141a] flex items-center justify-center text-[10px] font-bold text-slate-400">
                      AF
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                    <Lock className="size-3" /> Encrypted Access
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="pt-8 border-t border-surface-border flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
          <Shield className="size-3" /> 
          Vult Intel Administrator Control Panel — Unauthorized access is prohibited.
        </p>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => handleViewRaw('security')}
            className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1.5 font-medium"
          >
            Security Protocol <ExternalLink className="size-3" />
          </button>
          <button 
            onClick={() => handleViewRaw('roadmap')}
            className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1.5 font-medium"
          >
            Raw Roadmap <ExternalLink className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
