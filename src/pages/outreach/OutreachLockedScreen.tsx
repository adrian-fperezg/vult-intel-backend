import { motion } from 'framer-motion';
import { PaperPlaneIcon, TealButton } from './OutreachCommon';
import { Lock, Download } from 'lucide-react';

const FEATURES = [
  'Email scheduling with optimal send-time intelligence',
  'Email open & click tracking',
  'Spintax engine for unique messages',
  'Multi-step email sequences',
  'Multichannel sequences (email, LinkedIn, calls)',
  'AI-powered sequence generator',
  'Unified reply inbox (Unibox)',
  'Lead intent categorization',
  'B2B lead database & email finder',
  'Campaign analytics dashboard',
  'Email warmup & deliverability tracking',
  'SPF / DKIM / DMARC checker',
];

interface OutreachLockedScreenProps {
  onReactivate?: () => void;
  onExport?: () => void;
}

export default function OutreachLockedScreen({ onReactivate, onExport }: OutreachLockedScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full py-16 px-8 bg-background-dark">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-xl w-full text-center space-y-8"
      >
        {/* Lock Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex items-center justify-center"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-teal-500/10 blur-2xl scale-150" />
            <div className="relative size-20 rounded-3xl bg-teal-500/5 border border-teal-500/20 flex items-center justify-center">
              <Lock className="size-10 text-teal-500" strokeWidth={1.5} />
            </div>
          </div>
        </motion.div>

        {/* Message */}
        <div className="space-y-3">
          <h2 className="text-3xl font-bold text-white">Your Outreach subscription has ended</h2>
          <p className="text-slate-400 leading-relaxed">
            Your data is safe and preserved. Reactivate your subscription at any time to regain full access to all features and your campaign history.
          </p>
        </div>

        {/* Feature List — dimmed & struck out */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 text-left">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-4">Features locked</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2 opacity-40">
                <div className="size-1.5 rounded-full bg-slate-600 shrink-0" />
                <span className="text-sm text-slate-400 line-through">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <TealButton size="lg" onClick={onReactivate} className="min-w-[180px]">
            <PaperPlaneIcon className="size-5" />
            Reactivate
          </TealButton>
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-sm font-semibold transition-colors"
          >
            <Download className="size-4" />
            Export my data
          </button>
        </div>

        <p className="text-xs text-slate-600">Your campaigns, contacts, and history are preserved indefinitely.</p>
      </motion.div>
    </div>
  );
}
