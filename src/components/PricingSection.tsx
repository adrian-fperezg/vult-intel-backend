import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { landingTranslations } from '@/lib/translations';
import { CheckCircle2, Loader2, Zap, Mail, ArrowRight, Inbox, Users, BarChart2 } from 'lucide-react';
import { useCheckout } from '@/hooks/useCheckout';
import { useUserMetrics } from '@/hooks/useUserMetrics';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const PLAN_SOLO = 'prod_U33xHiVd7ipWbX';
const PLAN_GROWTH = 'prod_U33x2QQAQH8sMr';
const PLAN_AGENCY = 'prod_U33xENDetyV4Ux';
const ADDON_VEO = 'prod_U54OcVdHHV38Qv';
const ADDON_OUTREACH = 'prod_UBRSFq7kaL7bSr';

interface PricingSectionProps {
    id?: string;
    showAddon?: boolean;
}

export default function PricingSection({ id = "pricing", showAddon = true }: PricingSectionProps) {
    const { currentUser, isFounder } = useAuth(); // Added isFounder
    const { language, theme } = useSettings(); // theme is still used for styling
    const navigate = useNavigate();
    const t = landingTranslations[language as keyof typeof landingTranslations];
    const { startCheckout: handleCheckout, isLoading: isCheckoutLoading } = useCheckout(); // Renamed startCheckout to handleCheckout
    const { activeAddons } = useUserMetrics(); // Added useUserMetrics

    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

    const isVeoActive = isFounder || activeAddons.includes('veo_studio_pack'); // Added isVeoActive
    const isOutreachActive = isFounder || activeAddons.includes('outreach'); // Added isOutreachActive

    const handleChoosePlan = async (productId: string) => {
        if (isFounder) { // Added founder check
            console.log("Founder is active, cannot initiate checkout.");
            return;
        }
        if (!currentUser) {
            localStorage.setItem('landingPendingCheckout', productId);
            navigate('/auth');
            return;
        }
        setSelectedPlan(productId);
        await handleCheckout(productId); // Used handleCheckout
    };

    const renderFeature = (f: string, index: number, iconColorClass: string, isBlack = false) => {
        const hasColonAndSpace = f.includes(':');

        if (hasColonAndSpace) {
            const splitIndex = f.indexOf(':') + 1;
            const firstPart = f.substring(0, splitIndex);
            const rest = f.substring(splitIndex);
            return (
                <li key={index} className={`flex items-start gap-3 text-lg ${isBlack ? 'font-black' : 'font-medium'}`}>
                    <CheckCircle2 size={24} className={`${iconColorClass} mt-0.5 flex-shrink-0`} />
                    <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}>
                        <strong className={theme === 'dark' ? 'text-white' : 'text-slate-900'}>{firstPart}</strong>{rest}
                    </span>
                </li>
            );
        }
        return (
            <li key={index} className={`flex items-start gap-3 text-lg ${isBlack ? 'font-black' : 'font-medium'}`}>
                <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}>
                    <CheckCircle2 size={24} className={`${iconColorClass} mt-0.5 flex-shrink-0`} />
                    <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}>{f}</span>
                </span>
            </li>
        );
    };

    return (
        <section id={id} className={`py-24 px-6 ${theme === 'dark' ? 'bg-slate-900/40' : 'bg-slate-50/50'} w-full`}>
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-24">
                    <h2 className="text-5xl md:text-8xl font-black tracking-tighter mb-8">{t.pricingTitle}</h2>
                    <p className={`text-2xl font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-800'}`}>{t.pricingSubtitle}</p>
                </div>

                <div className="grid lg:grid-cols-3 gap-12 mb-20 items-stretch">
                    {/* Solo Plan */}
                    <div className={`p-10 rounded-[3rem] border flex flex-col ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                        <div className="mb-8">
                            <h3 className="text-2xl font-black mb-1">{t.planSoloName}</h3>
                            <p className={`text-sm font-bold tracking-wide uppercase opacity-50`}>{t.planSoloIdeal}</p>
                        </div>
                        <div className="mb-10 flex items-baseline gap-2">
                            <span className="text-6xl font-black tracking-tighter">{t.planSoloPrice}</span>
                            <span className="text-xl font-bold opacity-40">/mo</span>
                        </div>
                        <div className="py-2.5 px-5 rounded-full bg-blue-500/10 text-blue-500 text-sm font-black inline-block mb-10 self-start tracking-wider uppercase border border-blue-500/20">
                            {t.planSoloTokens}
                        </div>
                        <ul className="space-y-6 mb-12 flex-grow">
                            {t.planSoloFeatures.map((f, i) => renderFeature(f, i, "text-blue-500"))}
                        </ul>
                        <button
                            onClick={() => handleChoosePlan(PLAN_SOLO)}
                            disabled={isCheckoutLoading}
                            className={`w-full py-5 rounded-[1.5rem] font-black text-xl transition-all flex items-center justify-center gap-2 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-black hover:text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isCheckoutLoading && selectedPlan === PLAN_SOLO ? (
                                <>
                                    <Loader2 className="animate-spin" size={24} />
                                    {language === 'es' ? 'Cargando...' : 'Loading...'}
                                </>
                            ) : (
                                language === 'es' ? 'Elegir Plan' : 'Choose Plan'
                            )}
                        </button>
                    </div>

                    {/* Growth Plan */}
                    <div className={`p-10 rounded-[3rem] border-4 border-blue-600 flex flex-col relative shadow-[0_40px_100px_-20px_rgba(37,99,235,0.3)] transition-transform lg:-translate-y-8 ${theme === 'dark' ? 'bg-slate-950' : 'bg-white'}`}>
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-8 py-3 bg-blue-600 text-white text-sm font-black rounded-full uppercase tracking-[0.3em] shadow-2xl">
                            {t.planGrowthBadge}
                        </div>
                        <div className="mb-8">
                            <h3 className="text-2xl font-black mb-1">{t.planGrowthName}</h3>
                            <p className={`text-sm font-bold tracking-wide uppercase text-blue-500`}>{t.planGrowthIdeal}</p>
                        </div>
                        <div className="mb-10 flex items-baseline gap-2">
                            <span className="text-6xl font-black tracking-tighter">{t.planGrowthPrice}</span>
                            <span className="text-xl font-bold opacity-40">/mo</span>
                        </div>
                        <div className="py-2.5 px-5 rounded-full bg-blue-600 text-white text-sm font-black inline-block mb-10 self-start tracking-wider uppercase shadow-xl shadow-blue-500/20">
                            {t.planGrowthTokens}
                        </div>
                        <ul className="space-y-6 mb-12 flex-grow">
                            {t.planGrowthFeatures.map((f, i) => renderFeature(f, i, "text-blue-600", true))}
                        </ul>
                        <button
                            onClick={() => handleChoosePlan(PLAN_GROWTH)}
                            disabled={isCheckoutLoading}
                            className="w-full py-5 bg-blue-600 text-white rounded-[1.5rem] font-black text-2xl hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isCheckoutLoading && selectedPlan === PLAN_GROWTH ? (
                                <>
                                    <Loader2 className="animate-spin" size={28} />
                                    {language === 'es' ? 'Preparando...' : 'Initializing...'}
                                </>
                            ) : (
                                language === 'es' ? 'Suscribirse' : 'Subscribe'
                            )}
                        </button>
                    </div>

                    {/* Agency Plan */}
                    <div className={`p-10 rounded-[3rem] border flex flex-col ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200 shadow-xl shadow-slate-500/5'}`}>
                        <div className="mb-8 text-indigo-500">
                            <h3 className="text-2xl font-black mb-1">{t.planAgencyName}</h3>
                            <p className={`text-sm font-bold tracking-wide uppercase opacity-50`}>{t.planAgencyIdeal}</p>
                        </div>
                        <div className="mb-10 flex items-baseline gap-2">
                            <span className="text-6xl font-black tracking-tighter">{t.planAgencyPrice}</span>
                            <span className="text-xl font-bold opacity-40">/mo</span>
                        </div>
                        <div className="py-2.5 px-5 rounded-full bg-indigo-500/10 text-indigo-500 text-sm font-black inline-block mb-10 self-start tracking-wider uppercase border border-indigo-500/20">
                            {t.planAgencyTokens}
                        </div>
                        <ul className="space-y-6 mb-10 flex-grow">
                            {t.planAgencyFeatures.map((f, i) => renderFeature(f, i, "text-indigo-500"))}
                        </ul>
                        <p className="text-sm text-center text-slate-400 mb-10 italic font-medium px-4">{t.planAgencyNote}</p>
                        <button
                            onClick={() => handleChoosePlan(PLAN_AGENCY)}
                            disabled={isCheckoutLoading}
                            className={`w-full py-5 rounded-[1.5rem] font-black text-xl transition-all border-4 border-indigo-500/30 text-indigo-500 hover:bg-indigo-500 hover:text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isCheckoutLoading && selectedPlan === PLAN_AGENCY ? (
                                <>
                                    <Loader2 className="animate-spin" size={24} />
                                    {language === 'es' ? 'Cargando...' : 'Loading...'}
                                </>
                            ) : (
                                language === 'es' ? 'Elegir Plan' : 'Choose Plan'
                            )}
                        </button>
                    </div>
                </div>

                {/* Veo Studio Add-on Banner with Pulsing Effect */}
                {showAddon && (
                    <div className={`p-10 md:p-16 rounded-[3.5rem] border text-center relative overflow-hidden group ${theme === 'dark' ? 'bg-slate-950 border-pink-500/30 shadow-2xl shadow-pink-500/5' : 'bg-pink-50 border-pink-200'}`}>
                        <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 via-blue-500/5 to-purple-500/5 animate-shimmer pointer-events-none" />
                        <div className="absolute top-0 right-0 p-3 bg-pink-500 text-white rounded-bl-3xl shadow-xl">
                            <Zap size={24} fill="white" />
                        </div>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-10 relative z-10">
                            <div className="text-center md:text-left">
                                <h4 className="text-4xl md:text-5xl font-black text-pink-500 tracking-tighter leading-none mb-4">{t.addonTitle}</h4>
                                <p className={`text-xl font-medium max-w-xl ${theme === 'dark' ? 'text-slate-400' : 'text-slate-800'}`}>{t.addonDesc}</p>
                            </div>
                            <div className="flex flex-col items-center md:items-end gap-6">
                                <div className="text-center">
                                    <span className="text-5xl md:text-7xl font-black text-pink-600 tracking-tighter leading-none">{t.addonPrice}</span>
                                    <div className="text-sm font-black uppercase tracking-widest text-pink-500 mt-2">Audiovisual Power</div>
                                </div>
                                <button
                                    onClick={() => !isVeoActive && handleChoosePlan(ADDON_VEO)}
                                    disabled={isCheckoutLoading || isVeoActive}
                                    className="w-full py-4 px-6 bg-white text-black rounded-2xl font-bold uppercase tracking-wider hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isVeoActive ? (
                                        <>
                                            <CheckCircle2 className="size-5 text-emerald-600" />
                                            {isFounder ? "Active for Founder" : t.addonBadge}
                                        </>
                                    ) : (
                                        <>
                                            {isCheckoutLoading && selectedPlan === ADDON_VEO ? (
                                                <>
                                                    <Loader2 className="animate-spin" size={24} />
                                                    {language === 'es' ? 'Procesando...' : 'Processing...'}
                                                </>
                                            ) : (
                                                language === 'es' ? 'Mejorar Plan' : 'Upgrade Plan'
                                            )}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Outreach Module Add-on Banner */}
                {showAddon && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className={`mt-8 rounded-[3.5rem] border relative overflow-hidden group ${
                            theme === 'dark'
                                ? 'bg-slate-950 border-teal-500/30 shadow-2xl shadow-teal-500/5'
                                : 'bg-teal-50 border-teal-200'
                        }`}
                    >
                        {/* Animated background shimmer */}
                        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 via-cyan-500/5 to-emerald-500/5 animate-shimmer pointer-events-none" />

                        {/* Corner badge */}
                        <div className="absolute top-0 right-0 p-3 bg-teal-500 text-white rounded-bl-3xl shadow-xl">
                            <Mail size={24} fill="white" />
                        </div>

                        <div className="p-10 md:p-16">
                            {/* Top section: title + description + price + CTA */}
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-10 relative z-10 mb-10">
                                <div className="text-left">
                                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] mb-4 ${
                                        theme === 'dark' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' : 'bg-teal-100 text-teal-700 border border-teal-200'
                                    }`}>
                                        <Zap size={12} fill="currentColor" />
                                        {t.outreachAddonBadge}
                                    </div>
                                    <h4 className="text-4xl md:text-5xl font-black text-teal-500 tracking-tighter leading-none mb-4">{t.outreachAddonTitle}</h4>
                                    <p className={`text-xl font-medium max-w-xl ${
                                        theme === 'dark' ? 'text-slate-400' : 'text-slate-700'
                                    }`}>{t.outreachAddonDesc}</p>
                                </div>
                                <div className="flex flex-col items-start md:items-end gap-6 shrink-0">
                                    <div className="text-left md:text-right">
                                        <span className="text-5xl md:text-7xl font-black text-teal-600 tracking-tighter leading-none">{t.outreachAddonPrice}</span>
                                        <div className="text-sm font-black uppercase tracking-widest text-teal-500 mt-2">
                                            {language === 'es' ? 'Solo para suscriptores activos' : 'Active subscribers only'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => !isOutreachActive && handleChoosePlan(ADDON_OUTREACH)}
                                        disabled={isCheckoutLoading || isOutreachActive}
                                        className="w-full md:w-auto px-12 py-5 bg-teal-500 text-white rounded-2xl font-black text-xl hover:bg-teal-600 transition-all shadow-2xl shadow-teal-500/40 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group"
                                    >
                                        {isOutreachActive ? (
                                            <>
                                                <CheckCircle2 className="size-6 text-white" />
                                                {isFounder ? "Active for Founder" : t.outreachAddonBadge}
                                            </>
                                        ) : (
                                            <>
                                                {isCheckoutLoading && selectedPlan === ADDON_OUTREACH ? (
                                                    <>
                                                        <Loader2 className="animate-spin" size={24} />
                                                        {language === 'es' ? 'Procesando...' : 'Processing...'}
                                                    </>
                                                ) : (
                                                    <>
                                                        {language === 'es' ? 'Activar Outreach' : 'Activate Outreach'}
                                                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Feature pills */}
                            <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {[
                                    { icon: <Inbox size={18} />, label: language === 'es' ? 'Bandeja Unificada' : 'Unified Inbox' },
                                    { icon: <Users size={18} />, label: language === 'es' ? 'Gestión de Contactos' : 'Contact Management' },
                                    { icon: <BarChart2 size={18} />, label: language === 'es' ? 'Seguimiento de Apertura y Clics' : 'Open & Click Tracking' },
                                ].map((feat, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-3 px-5 py-4 rounded-2xl font-bold text-sm border ${
                                            theme === 'dark'
                                                ? 'bg-teal-500/5 border-teal-500/15 text-teal-300'
                                                : 'bg-white border-teal-200 text-teal-700'
                                        }`}
                                    >
                                        <span className="text-teal-500">{feat.icon}</span>
                                        {feat.label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </section>
    );
}
