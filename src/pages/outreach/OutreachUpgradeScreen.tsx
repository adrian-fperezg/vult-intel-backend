import { motion } from 'framer-motion';
import { PaperPlaneIcon, TealButton } from './OutreachCommon';
import { Check } from 'lucide-react';

const FEATURES = [
  'Email scheduling with optimal send-time intelligence',
  'Email open & click tracking with pixel-based technology',
  'Spintax engine for unique, spam-resistant messages',
  'Multi-step email sequences with auto-stop on reply',
  'Multichannel sequences: email, LinkedIn, calls & tasks',
  'AI-powered sequence generator & OOO detection',
  'Unified reply inbox (Unibox) across all mailboxes',
  'Lead intent categorization (INTERESTED, MEETING_REQUEST, etc.)',
  'B2B lead database & email finder integration',
  'Campaign analytics with open, click, and reply rates',
  'Email warmup & deliverability score tracking',
  'SPF / DKIM / DMARC authentication checker',
];

interface OutreachUpgradeScreenProps {
  onSubscribe?: () => void;
}

export default function OutreachUpgradeScreen({ onSubscribe }: OutreachUpgradeScreenProps) {

  const handleSubscribe = async () => {
    // TODO: call POST /api/subscriptions/addons/outreach/subscribe
    onSubscribe?.();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full py-16 px-8 bg-background-dark">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-2xl w-full text-center space-y-8"
      >
        {/* Hero Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex items-center justify-center"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-teal-500/20 blur-2xl scale-150" />
            <div className="relative size-24 rounded-3xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shadow-2xl">
              <PaperPlaneIcon className="size-12 text-teal-400" />
            </div>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-bold uppercase tracking-widest">
            Premium Add-on
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">
            Outreach <span className="text-teal-400">Automation</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-lg mx-auto leading-relaxed">
            Turn cold contacts into warm conversations — automatically. Send from your own Gmail, track every interaction, and close deals while you sleep.
          </p>
        </motion.div>

        {/* Feature List */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="bg-white/[0.02] border border-white/8 rounded-2xl p-6 text-left"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-teal-400 mb-4">What's included</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-start gap-2.5">
                <div className="size-5 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="size-3 text-teal-400" />
                </div>
                <span className="text-sm text-slate-300 leading-snug">{feature}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="flex flex-col items-center gap-3"
        >
          <TealButton size="lg" onClick={handleSubscribe} className="min-w-[220px] text-base">
            <PaperPlaneIcon className="size-5" />
            Unlock Outreach
          </TealButton>
          <p className="text-xs text-slate-500">Cancel anytime · Instant access · Billed monthly</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
