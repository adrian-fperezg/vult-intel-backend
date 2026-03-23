import React, { useState } from 'react';
import { useUserMetrics } from '@/hooks/useUserMetrics';
import { useAuth } from '@/contexts/AuthContext';
import { PlanId } from '@/utils/subscriptionManager';
import { isFounder as checkIsFounder } from '@/utils/founderUtils';
import { Lock, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const PLAN_LEVELS: Record<PlanId, number> = {
    solo: 0,
    growth: 1,
    agency: 2,
};

interface PremiumFeatureGateProps {
    children: React.ReactNode;
    /** El plan mínimo requerido para ver el contenido */
    requiredPlan: PlanId;
    featureTitle: string;
    featureDescription: string;
    featureBenefits: string[];
    upgradeButtonText?: string;
    className?: string; // Para clases extra en el wrapper principal
}

export function PremiumFeatureGate({
    children,
    requiredPlan,
    featureTitle,
    featureDescription,
    featureBenefits,
    upgradeButtonText = "Actualizar Plan",
    className
}: PremiumFeatureGateProps) {
    const { currentPlanId } = useUserMetrics();
    const { currentUser } = useAuth();
    const [isRedirecting, setIsRedirecting] = useState(false);

    // Verificamos si el usuario tiene acceso basado en la jerarquía de planes o si es el fundador
    const userLevel = PLAN_LEVELS[currentPlanId] || 0;
    const requiredLevel = PLAN_LEVELS[requiredPlan] || 1;
    const isFounderAccount = checkIsFounder(currentUser?.email);
    const hasAccess = isFounderAccount || userLevel >= requiredLevel;

    const handleUpgrade = () => {
        if (!currentUser) return;
        setIsRedirecting(true);
        // Usamos la lógica existente de Stripe Customer Portal
        const emailParam = currentUser.email ? `?prefilled_email=${encodeURIComponent(currentUser.email)}` : '';
        const portalUrl = `https://billing.stripe.com/p/login/6oU3cudrxfYM0JdabgbjW00${emailParam}`;
        window.location.assign(portalUrl);
        setTimeout(() => setIsRedirecting(false), 2000);
    };

    const planName = requiredPlan === 'growth' ? 'Growth' : requiredPlan === 'agency' ? 'Agency' : 'Premium';

    if (hasAccess) {
        return <>{children}</>;
    }

    return (
        <div className={cn("relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/20", className)}>
            {/* Contenido Desenfocado (La Herramienta) */}
            <div className="opacity-[0.15] blur-[8px] sm:blur-md pointer-events-none select-none transition-all duration-500 will-change-transform">
                {children}
            </div>

            {/* Paywall Overlay */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 sm:p-8 text-center bg-slate-950/60 backdrop-blur-[2px]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="max-w-md w-full flex flex-col items-center bg-slate-950/90 border border-white/10 p-8 rounded-3xl shadow-2xl relative overflow-hidden"
                >
                    {/* Subtle background glow */}
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />
                    <div className="absolute -top-10 inset-x-0 h-20 bg-amber-500/20 blur-3xl rounded-full" />

                    {/* Lock Icon */}
                    <div className="relative size-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center border border-amber-500/20 mb-6 shadow-inner">
                        <Lock className="size-6 text-amber-500 drop-shadow-sm" />
                    </div>

                    {/* Plan Badge */}
                    <div className="mb-5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-4 py-1.5 rounded-full border border-amber-500/20 inline-flex items-center gap-2 shadow-inner">
                            <Sparkles className="size-3.5" /> Exclusivo del Plan {planName}
                        </span>
                    </div>

                    <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">
                        {featureTitle}
                    </h3>

                    <p className="text-sm text-slate-400 leading-relaxed mb-8 max-w-[90%] mx-auto">
                        {featureDescription}
                    </p>

                    <ul className="space-y-4 mb-8 w-full text-left bg-white/5 p-5 rounded-2xl border border-white/5">
                        {featureBenefits.map((benefit, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                                <div className="mt-0.5 rounded-full bg-emerald-500/10 p-0.5 shrink-0">
                                    <CheckCircle2 className="size-4 text-emerald-400" />
                                </div>
                                <span className="leading-tight font-medium">{benefit}</span>
                            </li>
                        ))}
                    </ul>

                    <button
                        onClick={handleUpgrade}
                        disabled={isRedirecting}
                        className="group relative w-full py-4 bg-white text-black hover:bg-slate-200 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] disabled:opacity-50 overflow-hidden"
                    >
                        {/* Botón Shimmer Effect */}
                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-shimmer" />
                        <span className="relative z-10">
                            {isRedirecting ? "Redirigiendo a Stripe..." : upgradeButtonText}
                        </span>
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
