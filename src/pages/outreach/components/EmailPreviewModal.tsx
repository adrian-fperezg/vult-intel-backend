import React, { useState } from 'react';
import { X, Monitor, Smartphone, Mail, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../../lib/utils';
import { useSettings } from '../../../contexts/SettingsContext';
import { parsePreviewVariables } from '../../../utils/outreach/previewParser';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  body: string;
  to?: string;
  recipientData?: any;
}

export default function EmailPreviewModal({ isOpen, onClose, subject, body, to = "recipient@example.com", recipientData }: EmailPreviewModalProps) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const { theme } = useSettings();

  const recipientName = recipientData ? `${recipientData.first_name || ''} ${recipientData.last_name || ''}`.trim() || recipientData.email : null;
  const displayTo = recipientData?.email || to;

  const parsedSubject = parsePreviewVariables(subject || "(No Subject)", recipientData);
  const parsedBody = parsePreviewVariables(body || "<p>(Empty Body)</p>", recipientData);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={cn(
            "relative w-full h-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border",
            theme === 'dark' ? "bg-[#0f1115] border-surface-border text-white" : "bg-white border-slate-200 text-slate-900"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-surface-border/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Mail className="size-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h3 className="font-semibold text-lg leading-tight">Email Preview</h3>
                <div className="flex items-center gap-2 mt-1">
                  {recipientData ? (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-[10px] font-bold text-teal-400 uppercase tracking-tight">
                      <div className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
                      Previewing as: {recipientName}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-400 uppercase tracking-tight">
                      <div className="size-1.5 rounded-full bg-amber-500" />
                      Sample Data
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-surface-darker/50 p-1 rounded-xl border border-surface-border/30">
              <button
                onClick={() => setViewMode('desktop')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                  viewMode === 'desktop' 
                    ? "bg-primary text-white shadow-lg" 
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Monitor className="size-4" />
                Desktop
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                  viewMode === 'mobile' 
                    ? "bg-primary text-white shadow-lg" 
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Smartphone className="size-4" />
                Mobile
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X className="size-6" />
            </button>
          </div>

          {/* Email Content Area */}
          <div className="flex-1 overflow-auto bg-surface-dark/30 p-4 md:p-8 flex justify-center items-start">
            <div 
              className={cn(
                "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden shadow-2xl flex flex-col",
                viewMode === 'desktop' ? "w-full max-w-4xl min-h-[600px] border border-surface-border/50 rounded-xl bg-white" : "w-[375px] h-[667px] border-[12px] border-[#222] rounded-[40px] bg-white relative"
              )}
            >
              {/* Mobile Status Bar Simulation */}
              {viewMode === 'mobile' && (
                <div className="h-6 w-full flex justify-between px-6 pt-1 items-center bg-white">
                  <span className="text-[10px] font-bold text-black">9:41</span>
                  <div className="w-16 h-4 bg-black rounded-full absolute left-1/2 -translate-x-1/2 top-1" />
                  <div className="flex gap-1">
                    <div className="size-2 rounded-full border border-black/20" />
                    <div className="size-2 rounded-full bg-black/60" />
                  </div>
                </div>
              )}

              {/* Email Client Header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                    <User className="size-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-900 truncate">Vult Intel</span>
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Just now</span>
                    </div>
                    <div className="text-sm text-slate-500 flex flex-col gap-0.5">
                      <p><span className="text-slate-400">To:</span> {displayTo}</p>
                      <p><span className="text-slate-400">Sub:</span> <span className="font-semibold text-slate-900">{parsedSubject}</span></p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className="flex-1 p-6 overflow-y-auto bg-white text-slate-800 leading-relaxed font-sans">
                <div 
                  className="prose prose-slate max-w-none text-slate-800"
                  dangerouslySetInnerHTML={{ __html: parsedBody }}
                />
              </div>

              {/* Mobile Home Indicator */}
              {viewMode === 'mobile' && (
                <div className="h-4 pb-2 w-full flex justify-center items-end bg-white">
                  <div className="w-24 h-1 bg-black/20 rounded-full" />
                </div>
              )}
            </div>
          </div>

          {/* Footer Warning */}
          <div className="px-6 py-3 bg-primary/5 text-primary/70 text-[11px] font-medium text-center uppercase tracking-widest flex items-center justify-center gap-2">
            <div className="size-1.5 rounded-full bg-primary animate-pulse" />
            Sandbox Environment: Using realistic mock data for preview
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
