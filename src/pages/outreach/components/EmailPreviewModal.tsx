import React, { useState, useEffect } from 'react';
import { X, Monitor, Smartphone, Mail, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../../lib/utils';
import { useSettings } from '../../../contexts/SettingsContext';
import { useOutreachApi } from '../../../hooks/useOutreachApi';
import GmailPreview from './GmailPreview';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  body: string;
  to?: string;
  recipientData?: any;
  recipients?: any[];
}

export default function EmailPreviewModal({ isOpen, onClose, subject, body, to = "recipient@example.com", recipientData, recipients = [] }: EmailPreviewModalProps) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const { fetchSnippets, activeProjectId } = useOutreachApi();
  const [signature, setSignature] = useState("");
  const [allSnippets, setAllSnippets] = useState<any[]>([]);
  const [signatureLoaded, setSignatureLoaded] = useState(false);
  const [currentRecipientIndex, setCurrentRecipientIndex] = useState(0);
  const { theme } = useSettings();

  useEffect(() => {
    if (isOpen) setCurrentRecipientIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !activeProjectId) return;
    if (signatureLoaded) return; // already fetched for this session

    const getSignature = async () => {
      try {
        const snippets = await fetchSnippets();
        if (snippets) {
          setAllSnippets(snippets);
          const sigSnippet = snippets.find((s: any) => s.type === 'signature');
          // Use real body if available, else show key as fallback
          setSignature(sigSnippet?.body || '{{signature}}');
        }
      } catch (error) {
        console.error("Error fetching signature:", error);
        setSignature('{{signature}}');
      } finally {
        setSignatureLoaded(true);
      }
    };

    getSignature();
  }, [isOpen, activeProjectId, fetchSnippets, signatureLoaded]);

  // Reset on close so next open re-fetches fresh
  useEffect(() => {
    if (!isOpen) setSignatureLoaded(false);
  }, [isOpen]);

  const activeRecipient = recipients && recipients.length > 0 
    ? recipients[currentRecipientIndex] 
    : recipientData;

  const mergedRecipientData = { ...activeRecipient, signature };

  const recipientName = activeRecipient ? `${activeRecipient.first_name || ''} ${activeRecipient.last_name || ''}`.trim() || activeRecipient.email : null;
  const displayTo = activeRecipient?.email || to;
  const usingRealData = !!activeRecipient;

  const handleNext = () => {
    if (recipients.length > 0) {
      setCurrentRecipientIndex((prev) => (prev + 1) % recipients.length);
    }
  };

  const handlePrev = () => {
    if (recipients.length > 0) {
      setCurrentRecipientIndex((prev) => (prev - 1 + recipients.length) % recipients.length);
    }
  };

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
                  {recipientData || (recipients && recipients.length > 0) ? (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-[10px] font-bold text-teal-400 uppercase tracking-tight">
                      <div className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
                      Previewing as: {recipientName}
                      {recipients && recipients.length > 1 && (
                        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-teal-500/30">
                          <button onClick={handlePrev} className="p-0.5 hover:bg-teal-500/20 rounded transition-colors text-teal-400">
                            <ChevronLeft className="size-3" />
                          </button>
                          <span className="text-[9px] text-teal-500/80">{currentRecipientIndex + 1} / {recipients.length}</span>
                          <button onClick={handleNext} className="p-0.5 hover:bg-teal-500/20 rounded transition-colors text-teal-400">
                            <ChevronRight className="size-3" />
                          </button>
                        </div>
                      )}
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

              {viewMode === 'desktop' ? (
                <div className="flex-1 min-h-0 bg-white">
                   <GmailPreview 
                     subject={subject}
                     bodyHtml={body}
                     recipientData={mergedRecipientData}
                     recipientEmail={displayTo}
                     allSnippets={allSnippets}
                   />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto bg-white rounded-b-[28px]">
                   <GmailPreview 
                     subject={subject}
                     bodyHtml={body}
                     recipientData={mergedRecipientData}
                     recipientEmail={displayTo}
                     allSnippets={allSnippets}
                   />
                </div>
              )}

              {/* Mobile Home Indicator */}
              {viewMode === 'mobile' && (
                <div className="h-4 pb-2 w-full flex justify-center items-end bg-white">
                  <div className="w-24 h-1 bg-black/20 rounded-full" />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-surface-border/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              {usingRealData ? (
                <>
                  <div className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
                  <span>Previewing with real contact data</span>
                  {signature && signature !== '{{signature}}' && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-tight">
                      ✓ Real Signature
                    </span>
                  )}
                </>
              ) : (
                <>
                  <div className="size-1.5 rounded-full bg-amber-500" />
                  <span>No recipients in sequence — showing snippet keys as placeholders</span>
                </>
              )}
            </div>
            {signature && signature !== '{{signature}}' && (
              <div className="text-[10px] text-slate-600 italic">Signature loaded from your saved snippets</div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
