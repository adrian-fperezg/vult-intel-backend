import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, MousePointer2, MessageSquare, ChevronRight } from 'lucide-react';
import { OutreachBadge } from '../../OutreachCommon';
import { cn } from '@/lib/utils';

interface ConditionSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (conditionType: 'opened' | 'clicked' | 'replied') => void;
}

const CONDITIONS = [
  {
    id: 'opened',
    title: 'Opened previous email',
    description: 'Trigger when the recipient opens the most recent email in this thread.',
    icon: Mail,
    color: 'teal'
  },
  {
    id: 'clicked',
    title: 'Clicked a link in previous email',
    description: 'Trigger when the recipient clicks any link within the previous email.',
    icon: MousePointer2,
    color: 'blue'
  },
  {
    id: 'replied',
    title: 'Replied to previous email',
    description: 'Trigger when the recipient sends a reply to the previous email.',
    icon: MessageSquare,
    color: 'purple'
  }
];

export default function ConditionSelectorModal({ isOpen, onClose, onSelect }: ConditionSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#0d1117]/80 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-[#161b22] border border-white/10 rounded-[32px] shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Add Condition</h2>
              <p className="text-sm text-slate-500">Choose an engagement trigger to split your flow.</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="space-y-3">
            {CONDITIONS.map((condition) => (
              <button
                key={condition.id}
                onClick={() => {
                  onSelect(condition.id as any);
                  onClose();
                }}
                className="w-full group flex items-start gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-teal-500/30 transition-all text-left"
              >
                <div className={cn(
                  "size-12 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-110",
                  condition.id === 'opened' ? "bg-teal-500/10 border-teal-500/20 text-teal-400" :
                  condition.id === 'clicked' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                  "bg-purple-500/10 border-purple-500/20 text-purple-400"
                )}>
                  <condition.icon className="size-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-white">{condition.title}</h3>
                    <ChevronRight className="size-4 text-slate-700 group-hover:text-teal-500 transition-colors" />
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {condition.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-center">
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">
            The flow will split into <span className="text-teal-500">Yes</span> and <span className="text-red-400">No</span> branches based on this event.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
