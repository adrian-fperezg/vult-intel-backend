import React from 'react';
import { cn } from '@/lib/utils';

// ─── TEAL COLOR TOKENS ───────────────────────────────────────────────────────
export const TEAL = {
  primary: '#0F766E',
  accent: '#14B8A6',
  surface: '#CCFBF1',
  highlight: '#99F6E4',
} as const;

// ─── OUTREACH BADGE ───────────────────────────────────────────────────────────
type BadgeVariant =
  | 'teal'       // INTERESTED, MEETING_REQUEST
  | 'yellow'     // NOT_NOW, WARNING
  | 'red'        // UNSUBSCRIBE, NEGATIVE, BOUNCED
  | 'orange'     // WRONG_PERSON
  | 'gray'       // OUT_OF_OFFICE, INACTIVE
  | 'blue'       // NEUTRAL
  | 'green'      // ACTIVE, DELIVERED
  | 'purple';    // TRIAL

const BADGE_STYLES: Record<BadgeVariant, string> = {
  teal:   'bg-teal-500/15 text-teal-400 border-teal-500/20',
  yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  red:    'bg-red-500/15 text-red-400 border-red-500/20',
  orange: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  gray:   'bg-slate-500/15 text-slate-400 border-slate-500/20',
  blue:   'bg-blue-500/15 text-blue-400 border-blue-500/20',
  green:  'bg-green-500/15 text-green-400 border-green-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
};

interface OutreachBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export function OutreachBadge({ variant = 'gray', children, className, dot }: OutreachBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border',
      BADGE_STYLES[variant],
      className
    )}>
      {dot && <span className="size-1.5 rounded-full bg-current animate-pulse" />}
      {children}
    </span>
  );
}

// ─── OUTREACH METRIC CARD ─────────────────────────────────────────────────────
interface OutreachMetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  teal?: boolean;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

export function OutreachMetricCard({ label, value, sub, teal, icon, trend, trendValue }: OutreachMetricCardProps) {
  return (
    <div className={cn(
      'rounded-2xl border p-5 flex flex-col gap-2 transition-colors',
      teal
        ? 'bg-teal-500/5 border-teal-500/20 hover:border-teal-500/40'
        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
    )}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">{label}</p>
        {icon && <span className={cn('opacity-60', teal ? 'text-teal-400' : 'text-slate-500')}>{icon}</span>}
      </div>
      <p className={cn('text-3xl font-bold tabular-nums tracking-tight', teal ? 'text-teal-400' : 'text-white')}>
        {value}
      </p>
      {(sub || trend) && (
        <div className="flex items-center gap-2 mt-1">
          {trend && trendValue && (
            <span className={cn(
              'text-xs font-semibold',
              trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-slate-500'
            )}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </span>
          )}
          {sub && <span className="text-xs text-slate-500">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ─── OUTREACH EMPTY STATE ─────────────────────────────────────────────────────
interface OutreachEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function OutreachEmptyState({ icon, title, description, action }: OutreachEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.01] text-center max-w-3xl mx-auto">
      <div className="size-20 rounded-3xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-6 text-teal-400">
        <span className="[&>svg]:size-8">{icon}</span>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-slate-500 max-w-sm mb-8 leading-relaxed">
        {description}
      </p>
      {action && action}
    </div>
  );
}

// ─── OUTREACH SECTION HEADER ──────────────────────────────────────────────────
interface OutreachSectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function OutreachSectionHeader({ icon, title, subtitle, actions }: OutreachSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-teal-500/10 rounded-xl border border-teal-500/20">
          <span className="text-teal-400 [&>svg]:size-5">{icon}</span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── TEAL BUTTON ──────────────────────────────────────────────────────────────
interface TealButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  loading?: boolean;
}

export function TealButton({ variant = 'solid', size = 'md', children, className, loading, ...props }: TealButtonProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3 text-base',
  };

  const variantClasses = {
    solid: 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/30 disabled:opacity-50',
    outline: 'bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 hover:text-teal-300',
    ghost: 'text-teal-400 hover:text-teal-300 hover:bg-teal-500/10',
  };

  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all active:scale-95 disabled:cursor-not-allowed',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {loading && (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

// ─── PAPER PLANE ICON (SVG) ───────────────────────────────────────────────────
export function PaperPlaneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

// ─── OUTREACH CONFIRM DIALOG ──────────────────────────────────────────────────
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function OutreachConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger }: ConfirmDialogProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#161b22] border border-[#30363d] rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95',
              danger
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-teal-600 hover:bg-teal-500 text-white'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
