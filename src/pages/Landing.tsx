import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { landingTranslations } from '../lib/translations';
import {
    ArrowRight,
    CheckCircle2,
    BarChart3,
    Zap,
    Users,
    ShieldCheck,
    Search,
    Layout,
    Target,
    Globe,
    Plus,
    Minus,
    MessageSquare,
    ArrowUpRight,
    TrendingUp,
    Mail,
    Box,
    Cpu,
    Palette,
    Video,
    Loader2,
    Sun,
    Moon,
    Clock,
    Wallet,
    Activity
} from 'lucide-react';
import { useCheckout } from '../hooks/useCheckout';
import Logo from '../components/Logo';

import PricingSection from '../components/PricingSection';
import { motion, AnimatePresence } from 'framer-motion';

const Landing = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { language, theme, setLanguage, setTheme } = useSettings();
    const t = landingTranslations[language as keyof typeof landingTranslations] || landingTranslations.en;
    const [activeFaq, setActiveFaq] = useState<number | null>(null);
    const [scrolled, setScrolled] = useState(false);

    React.useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    return (
        <div className={`min-h-screen transition-colors duration-500 overflow-x-hidden ${theme === 'dark' ? 'bg-slate-950 text-slate-50' : 'bg-white text-slate-900'}`}>

            {/* Floating Navbar */}
            <nav className="fixed top-4 md:top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-7xl z-50">
                <div className={`backdrop-blur-2xl rounded-full border px-6 h-20 flex items-center justify-between transition-all duration-500 ${scrolled
                    ? (theme === 'dark' ? 'bg-[#171b23]/80 border-slate-700/50 shadow-2xl shadow-black/50' : 'bg-white/90 border-slate-200/50 shadow-2xl shadow-slate-200/50')
                    : 'bg-transparent border-transparent shadow-none'
                    }`}>
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
                        <Logo className="h-14 md:h-[4.2rem]" dark={theme === 'dark'} />
                    </div>

                    <div className="hidden md:flex items-center gap-8">
                        <a href="#how-it-works" onClick={(e) => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity">{t.hiwTitle}</a>
                        <a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity">{t.features}</a>
                        <a href="#pricing" onClick={(e) => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity">{t.pricing}</a>
                        <a href="#faq" onClick={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity">{t.faq}</a>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className={`p-2 rounded-lg border flex items-center justify-center transition-all ${theme === 'dark' ? 'border-slate-800 hover:bg-slate-900 text-yellow-500' : 'border-slate-200 hover:bg-slate-50 text-slate-800'}`}
                            title="Toggle Theme"
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button
                            onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
                            className={`p-2 px-3 rounded-lg border flex items-center gap-2 text-xs font-bold transition-all ${theme === 'dark' ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}
                        >
                            <Globe size={14} />
                            {language.toUpperCase()}
                        </button>
                        <button
                            onClick={() => navigate('/auth')}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10"
                        >
                            {t.login}
                        </button>
                    </div>
                </div>
            </nav>

            {/* 1. Hero Section */}
            <section className="relative pt-44 pb-20 px-6 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none" />

                <div className="max-w-6xl mx-auto text-center relative z-10">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-8 ${theme === 'dark' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}
                    >
                        <ShieldCheck size={16} />
                        {t.heroBadge}
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.95]"
                    >
                        {t.heroTitle1} <span className="text-blue-600 italic font-black">{t.heroTitle2}</span>
                        <br />
                        <span className="text-4xl md:text-6xl block mt-6 opacity-90 tracking-tight">{t.heroTitle3}</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className={`text-xl md:text-2xl max-w-3xl mx-auto mb-12 leading-relaxed font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-700'}`}
                    >
                        {t.heroSubtitle}
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <button
                            onClick={() => currentUser ? navigate('/deep-scan') : navigate('/auth')}
                            className="w-full sm:w-auto px-10 py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-2xl shadow-blue-500/30 active:scale-95"
                        >
                            {t.heroCtaPrimary}
                            <ArrowRight size={24} />
                        </button>
                        <a
                            href="#pricing"
                            onClick={(e) => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }}
                            className={`w-full sm:w-auto px-10 py-5 rounded-2xl font-bold text-xl transition-all border flex items-center justify-center ${theme === 'dark' ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}
                        >
                            {t.heroCtaSecondary}
                        </a>
                    </motion.div>
                </div>
            </section>

            {/* 2. Comparison Table (The Traditional Stack vs Vult Intel) */}
            <section className={`py-32 px-6 ${theme === 'dark' ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className="max-w-5xl mx-auto"
                >
                    <div className="text-center mb-20">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">{t.compTitle}</h2>
                        <p className={`text-xl font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-800'}`}>{t.compSubtitle}</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-10 items-stretch">
                        {/* Old Way */}
                        <div className={`p-10 rounded-[2.5rem] border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h3 className={`text-xl font-black mb-1 uppercase tracking-widest ${theme === 'dark' ? 'text-slate-500' : 'text-slate-700'}`}>{t.compOldTitle}</h3>
                                    <p className={`text-4xl font-black ${theme === 'dark' ? 'text-slate-400' : 'text-slate-800'}`}>{t.compOldPrice}</p>
                                </div>
                                <Users className="text-slate-400" size={32} />
                            </div>
                            <ul className="space-y-5 mb-10">
                                {Object.entries(t.compTools).map(([key, val]) => (
                                    <li key={key} className={`flex items-center gap-3 text-lg font-bold line-through opacity-80 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-600'}`}>
                                        <Minus size={18} className="text-red-500" />
                                        {val}
                                    </li>
                                ))}
                            </ul>
                            <div className="p-5 rounded-2xl bg-red-500/5 text-red-500 border border-red-500/10 text-sm italic font-bold">
                                Manual work, fragmented data, high overhead.
                            </div>
                        </div>

                        {/* Vult Way */}
                        <div className={`p-10 rounded-[2.5rem] border-4 border-blue-600 relative overflow-hidden ${theme === 'dark' ? 'bg-slate-950 shadow-[0_0_80px_rgba(37,99,235,0.15)]' : 'bg-white shadow-2xl shadow-blue-500/10'}`}>
                            <div className="absolute top-0 right-0 py-2 px-6 bg-blue-600 text-white text-xs font-black rounded-bl-2xl uppercase tracking-[0.2em]">
                                Elite Efficiency
                            </div>
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h3 className="text-xl font-black text-blue-600 mb-1 uppercase tracking-widest">{t.compNewTitle}</h3>
                                    <p className="text-4xl font-black">{t.compNewPrice}</p>
                                </div>
                                <Zap className="text-blue-600 fill-blue-600" size={32} />
                            </div>
                            <p className="text-2xl text-blue-500 font-black mb-8 flex items-center gap-3">
                                <CheckCircle2 size={24} />
                                {t.compSaving}
                            </p>
                            <ul className="space-y-5 mb-10">
                                {["One Dashboard", "Unified Brand Voice", "Automated Research", "1-Click Generation", "Advanced Systems"].map((item, i) => (
                                    <li key={i} className="flex items-center gap-4 text-lg font-black">
                                        <CheckCircle2 size={22} className="text-green-500" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <div className="p-5 rounded-2xl bg-blue-600/5 text-blue-600 border border-blue-600/10 text-sm font-black uppercase tracking-wider">
                                {t.compInsight}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* NEW: How It Works Section */}
            <section id="how-it-works" className="py-32 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-24 relative">
                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-4xl md:text-5xl font-black mb-6"
                        >
                            {t.hiwTitle}
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className={`text-xl max-w-2xl mx-auto font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-800'}`}
                        >
                            {t.hiwSubtitle}
                        </motion.p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Step 1 */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className={`p-10 rounded-3xl border relative overflow-hidden group hover:-translate-y-2 transition-transform duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
                        >
                            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-8 shadow-xl shadow-blue-500/20 group-hover:scale-110 transition-transform">
                                <Globe size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4">{t.hiwStep1Title}</h3>
                            <p className={`text-lg leading-relaxed font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-700'}`}>
                                {t.hiwStep1Desc}
                            </p>
                        </motion.div>

                        {/* Step 2 */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className={`p-10 rounded-3xl border relative overflow-hidden group hover:-translate-y-2 transition-transform duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
                        >
                            <div className="w-16 h-16 rounded-2xl bg-purple-600 text-white flex items-center justify-center mb-8 shadow-xl shadow-purple-500/20 group-hover:scale-110 transition-transform">
                                <Cpu size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4">{t.hiwStep2Title}</h3>
                            <p className={`text-lg leading-relaxed font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-700'}`}>
                                {t.hiwStep2Desc}
                            </p>
                        </motion.div>

                        {/* Step 3 */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.3 }}
                            className={`p-10 rounded-3xl border relative overflow-hidden group hover:-translate-y-2 transition-transform duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
                        >
                            <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-8 shadow-xl shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                                <Zap size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4">{t.hiwStep3Title}</h3>
                            <p className={`text-lg leading-relaxed font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-700'}`}>
                                {t.hiwStep3Desc}
                            </p>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* 3. Core Features Showcase */}
            <section id="features" className="py-32 px-6">
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className="max-w-6xl mx-auto"
                >
                    <div className="text-center mb-24">
                        <h2 className="text-4xl md:text-7xl font-black tracking-tighter mb-8">{t.showcaseTitle}</h2>
                        <p className={`text-2xl font-medium max-w-4xl mx-auto ${theme === 'dark' ? 'text-slate-400' : 'text-slate-700'}`}>
                            {t.showcaseSubtitle}
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-10">
                        {/* Deep Scan */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className={`p-10 rounded-[2.5rem] border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-blue-500/50 shadow-2xl shadow-blue-500/5' : 'bg-white border-slate-200 hover:shadow-2xl'}`}
                        >
                            <div className={`w-16 h-16 rounded-2xl mb-8 flex items-center justify-center ${theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                                <Search size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4 tracking-tight">{t.featureDeepScanTitle}</h3>
                            <p className={`text-lg leading-relaxed mb-8 font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                                {t.featureDeepScanDesc}
                            </p>
                            <div className={`h-2.5 w-full bg-slate-200 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                <div className="h-full bg-blue-500 w-[75%] rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                            </div>
                        </motion.div>

                        {/* Persona Studio */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className={`p-10 rounded-[2.5rem] border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-indigo-500/50 shadow-2xl shadow-indigo-500/5' : 'bg-white border-slate-200 hover:shadow-2xl'}`}
                        >
                            <div className={`w-16 h-16 rounded-2xl mb-8 flex items-center justify-center ${theme === 'dark' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                                <Users size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4 tracking-tight">{t.featurePersonaTitle}</h3>
                            <p className={`text-lg leading-relaxed mb-8 font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                                {t.featurePersonaDesc}
                            </p>
                            <div className="flex -space-x-3 mb-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className={`w-12 h-12 rounded-full border-4 ${theme === 'dark' ? 'bg-slate-800 border-slate-900' : 'bg-slate-100 border-white'}`} />
                                ))}
                            </div>
                        </motion.div>

                        {/* Campaign Architect */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className={`p-10 rounded-[2.5rem] border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-emerald-500/50 shadow-2xl shadow-emerald-500/5' : 'bg-white border-slate-200 hover:shadow-2xl'}`}
                        >
                            <div className={`w-16 h-16 rounded-2xl mb-8 flex items-center justify-center ${theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                                <Layout size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4 tracking-tight">{t.featureCampaignTitle}</h3>
                            <p className={`text-lg leading-relaxed mb-8 font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                                {t.featureCampaignDesc}
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="h-3 rounded-full bg-emerald-500/20" />
                                <div className="h-3 rounded-full bg-emerald-500/40" />
                                <div className="h-3 rounded-full bg-emerald-500/60" />
                            </div>
                        </motion.div>

                        {/* Visual Workflows */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className={`p-10 rounded-[2.5rem] border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-violet-500/50 shadow-2xl shadow-violet-500/5' : 'bg-white border-slate-200 hover:shadow-2xl'}`}
                        >
                            <div className={`w-16 h-16 rounded-2xl mb-8 flex items-center justify-center ${theme === 'dark' ? 'bg-violet-500/20 text-violet-400' : 'bg-violet-50 text-violet-600'}`}>
                                <TrendingUp size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4 tracking-tight">{t.featureWorkflowsTitle}</h3>
                            <p className={`text-lg leading-relaxed mb-8 font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                                {t.featureWorkflowsDesc}
                            </p>
                            <div className="flex gap-4 items-center">
                                <div className="w-10 h-10 rounded-xl bg-violet-500/20 animate-pulse" />
                                <ArrowRight size={24} className="text-slate-400" />
                                <div className="w-10 h-10 rounded-xl bg-violet-500/40" />
                            </div>
                        </motion.div>

                        {/* Web Growth */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className={`p-10 rounded-[2.5rem] border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-orange-500/50 shadow-2xl shadow-orange-500/5' : 'bg-white border-slate-200 hover:shadow-2xl'}`}
                        >
                            <div className={`w-16 h-16 rounded-2xl mb-8 flex items-center justify-center ${theme === 'dark' ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
                                <BarChart3 size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4 tracking-tight">{t.featureWebGrowthTitle}</h3>
                            <p className={`text-lg leading-relaxed mb-8 font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                                {t.featureWebGrowthDesc}
                            </p>
                            <div className="flex items-end gap-2 h-10">
                                {[4, 8, 6, 10, 7].map((h, i) => (
                                    <div key={i} className="flex-1 bg-orange-500/30 rounded-t-lg transition-all hover:bg-orange-500/50" style={{ height: `${h * 10}%` }} />
                                ))}
                            </div>
                        </motion.div>

                        {/* Design Lab */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className={`p-10 rounded-[2.5rem] border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-pink-500/50 shadow-2xl shadow-pink-500/5' : 'bg-white border-slate-200 hover:shadow-2xl'}`}
                        >
                            <div className={`w-16 h-16 rounded-2xl mb-8 flex items-center justify-center ${theme === 'dark' ? 'bg-pink-500/20 text-pink-400' : 'bg-pink-50 text-pink-600'}`}>
                                <Palette size={32} />
                            </div>
                            <h3 className="text-2xl font-black mb-4 tracking-tight">{t.featureLabTitleTts || t.featureLabTitle}</h3>
                            <p className={`text-lg leading-relaxed mb-8 font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                                {t.featureLabDesc}
                            </p>
                            <div className="flex gap-4">
                                <Box size={24} className="text-pink-500/60" />
                                <Video size={24} className="text-pink-500/60" />
                                <Cpu size={24} className="text-pink-500/60" />
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            </section>

            {/* 4. "No Blind Steps" Philosophy Section */}
            <section className={`py-40 px-6 ${theme === 'dark' ? 'bg-blue-600/5' : 'bg-blue-50'}`}>
                <div className="max-w-5xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className={`p-12 md:p-24 rounded-[3.5rem] border ${theme === 'dark' ? 'bg-slate-950/80 border-blue-500/20 shadow-2xl shadow-blue-500/5' : 'bg-white border-blue-200 shadow-[0_40px_100px_-20px_rgba(37,99,235,0.15)]'}`}
                    >
                        <Zap className="mx-auto mb-12 text-blue-600 fill-blue-600" size={80} />
                        <h2 className="text-4xl md:text-7xl font-black tracking-tighter mb-12 leading-none">{t.noBlindTitle}</h2>
                        <p className={`text-2xl md:text-4xl italic font-serif font-medium leading-[1.3] ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                            " {t.noBlindDesc} "
                        </p>
                        <div className={`mt-20 pt-12 border-t font-black tracking-[0.3em] text-xs uppercase ${theme === 'dark' ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                            Rethinking Marketing Architecture with Google Gemini 3.1 Pro
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* 5. Personas Section */}
            <section className="py-32 px-6 overflow-hidden">
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className="max-w-7xl mx-auto"
                >
                    <div className="mb-20">
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">{t.personasTitle}</h2>
                        <p className={`text-2xl font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-700'}`}>{t.personasSubtitle}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            { title: t.personasAgencyTitle, desc: t.personasAgencyDesc, icon: <Layout className="text-blue-500" /> },
                            { title: t.personasFreelancerTitle, desc: t.personasFreelancerDesc, icon: <Zap className="text-orange-500" /> },
                            { title: t.personasCmoTitle, desc: t.personasCmoDesc, icon: <Target className="text-emerald-500" /> },
                            { title: t.personasOwnerTitle, desc: t.personasOwnerDesc, icon: <ShieldCheck className="text-indigo-500" /> }
                        ].map((persona, i) => (
                            <motion.div
                                key={i}
                                whileHover={{ scale: 1.05, y: -5 }}
                                className={`p-10 rounded-[2.5rem] border ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-slate-600' : 'bg-white border-slate-200 shadow-xl shadow-slate-500/5'}`}
                            >
                                <div className="mb-8 scale-150 origin-left">{persona.icon}</div>
                                <h4 className="font-black text-2xl mb-4 tracking-tight">{persona.title}</h4>
                                <p className={`text-base leading-relaxed font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-700'}`}>{persona.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* 6. Founder's Vision Section */}
            <section className={`relative py-40 px-6 overflow-hidden ${theme === 'dark' ? 'bg-slate-900/30' : 'bg-slate-50/50'}`}>
                <div className="max-w-6xl mx-auto relative z-10">
                    <div className="grid lg:grid-cols-2 gap-20 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black mb-8 bg-blue-600 text-white uppercase tracking-widest">
                                The Origin
                            </div>
                            <h2 className="text-5xl md:text-7xl font-black tracking-tighter mb-8 leading-none">{t.founderTitle}</h2>
                            <p className={`text-2xl md:text-3xl font-medium leading-tight mb-12 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}`}>
                                {t.founderBio}
                            </p>
                            <div className={`p-10 rounded-[2.5rem] border-2 border-dashed ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
                                <h4 className="text-sm font-black mb-4 text-blue-600 uppercase tracking-[0.3em]">{t.founderMissionTitle}</h4>
                                <p className="text-xl font-bold leading-relaxed">
                                    {t.noviceExpert}
                                </p>
                            </div>
                        </motion.div>

                        <div className="grid gap-8">
                            {[
                                { title: t.bottleneckTimeTitle, desc: t.bottleneckTimeDesc, icon: <Clock className="text-blue-500" size={40} />, color: "blue", delay: 0.1 },
                                { title: t.bottleneckMoneyTitle, desc: t.bottleneckMoneyDesc, icon: <Wallet className="text-emerald-500" size={40} />, color: "emerald", delay: 0.2 },
                                { title: t.bottleneckStressTitle, desc: t.bottleneckStressDesc, icon: <Activity className="text-rose-500" size={40} />, color: "rose", delay: 0.3 }
                            ].map((item, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: item.delay }}
                                    whileHover={{ scale: 1.02 }}
                                    className={`p-10 rounded-[3rem] border transition-all duration-500 flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-8 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 hover:border-blue-500/30' : 'bg-white border-slate-100 shadow-2xl shadow-slate-200/40 hover:border-blue-200'}`}
                                >
                                    <div className={`p-6 rounded-3xl shrink-0 ${theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'}`}>
                                        {item.icon}
                                    </div>
                                    <div>
                                        <h3 className="text-3xl font-black mb-3">{item.title}</h3>
                                        <p className={`text-xl font-medium leading-relaxed ${theme === 'dark' ? 'text-slate-500' : 'text-slate-600'}`}>
                                            {item.desc}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-64 h-64 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600/5 blur-[150px] rounded-full pointer-events-none" />
            </section>

            {/* 7. Pricing Section */}
            <PricingSection id="pricing" />

            {/* 7. FAQ Section */}
            <section id="faq" className="py-40 px-6 max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                >
                    <h2 className="text-4xl md:text-7xl font-black tracking-tighter mb-20 text-center leading-none">{t.faqTitle}</h2>
                    <div className="space-y-6">
                        {[
                            { q: t.faqQ1, a: t.faqA1 },
                            { q: t.faqQ2, a: t.faqA2 },
                            { q: t.faqQ3, a: t.faqA3 },
                            { q: t.faqQ4, a: t.faqA4 },
                            { q: t.faqQ5, a: t.faqA5 },
                            { q: t.faqQ6, a: t.faqA6 },
                            { q: t.faqQ7, a: t.faqA7 }
                        ].map((faq, i) => (
                            <div key={i} className={`rounded-[2rem] border transition-all duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 shadow-xl shadow-slate-500/5 hover:shadow-2xl'}`}>
                                <button
                                    onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                                    className="w-full p-8 md:p-10 flex items-center justify-between text-left gap-6 group"
                                >
                                    <span className="text-xl md:text-2xl font-black tracking-tight leading-snug group-hover:text-blue-500 transition-colors">{faq.q}</span>
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 ${activeFaq === i ? 'bg-blue-600 text-white rotate-180' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                        {activeFaq === i ? <Minus size={24} /> : <Plus size={24} />}
                                    </div>
                                </button>
                                <AnimatePresence>
                                    {activeFaq === i && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className={`p-8 md:p-10 pt-0 text-lg md:text-xl font-medium leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-700'}`}>
                                                {faq.a}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* 8. Footer */}
            <footer className={`py-40 px-6 border-t ${theme === 'dark' ? 'bg-[#171b23] border-slate-900' : 'bg-[#ffffff] border-slate-100'}`}>
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-20 mb-24">
                        <div className="max-w-md">
                            <div className="flex items-center gap-3 mb-8">
                                <Logo className="h-[5.6rem] md:h-[7rem] origin-left" dark={theme === 'dark'} />
                            </div>
                            <p className={`text-xl font-medium leading-relaxed mb-10 ${theme === 'dark' ? 'text-slate-500' : 'text-[#0a0a0a]'}`}>
                                {t.heroSubtitle.slice(0, 160)}...
                            </p>
                            <div className="flex gap-6">
                                <a href="mailto:support@vultintel.com" className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center hover:scale-110 transition-transform"><Mail size={20} /></a>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-16 md:gap-24 w-full md:w-auto">
                            <div>
                                <h5 className="font-black mb-8 uppercase text-sm tracking-[0.3em] text-blue-600">Product</h5>
                                <ul className={`space-y-5 text-lg font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-[#0a0a0a]'}`}>
                                    <li>
                                        <a href="#how-it-works" onClick={(e) => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-blue-600 cursor-pointer transition-colors block">
                                            {t.hiwTitle}
                                        </a>
                                    </li>
                                    <li>
                                        <a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-blue-600 cursor-pointer transition-colors block">
                                            {t.features}
                                        </a>
                                    </li>
                                    <li>
                                        <a href="#pricing" onClick={(e) => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-blue-600 cursor-pointer transition-colors block">
                                            {t.pricing}
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <h5 className="font-black mb-8 uppercase text-sm tracking-[0.3em] text-blue-600">Resources</h5>
                                <ul className={`space-y-5 text-lg font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-[#0a0a0a]'}`}>
                                    <li>
                                        <a href="#faq" onClick={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-blue-600 cursor-pointer transition-colors block">
                                            {t.faq}
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <h5 className="font-black mb-8 uppercase text-sm tracking-[0.3em] text-blue-600">Legal</h5>
                                <ul className={`space-y-5 text-lg font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-[#0a0a0a]'}`}>
                                    <li
                                        onClick={() => navigate('/privacy')}
                                        className="hover:text-blue-600 cursor-pointer transition-colors"
                                    >
                                        {t.footerPrivacy}
                                    </li>
                                    <li
                                        onClick={() => navigate('/terms')}
                                        className="hover:text-blue-600 cursor-pointer transition-colors"
                                    >
                                        {t.footerTerms}
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className={`pt-12 border-t flex flex-col sm:flex-row justify-between items-center gap-8 text-xs font-black tracking-[0.4em] uppercase ${theme === 'dark' ? 'border-slate-900 text-slate-500' : 'border-slate-100 text-[#0a0a0a]'}`}>
                        <div className="text-center sm:text-left">{t.footerRights.replace('{year}', new Date().getFullYear().toString())}</div>
                        <div className="flex flex-wrap justify-center gap-10">
                            <span className="flex items-center gap-2 hover:text-blue-600 cursor-pointer transition-colors">
                                <Globe size={14} />
                                {language === 'en' ? 'English (US)' : 'Español (LATAM)'}
                            </span>
                            <span className={`flex items-center gap-2 font-bold ${theme === 'dark' ? 'text-blue-600/60' : 'text-blue-700/80'}`}>
                                <Zap size={14} fill="currentColor" />
                                Unified Intelligence
                            </span>
                        </div>
                    </div>
                </div>
            </footer>

            {/* Styles for the shimmer effect */}
            <style>{`
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        .animate-shimmer {
          background-size: 1000px 100%;
          animation: shimmer 15s linear infinite;
        }
      `}</style>
        </div>
    );
};

export default Landing;
