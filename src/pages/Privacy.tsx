import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, Zap, Database, Globe } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../lib/utils';
import Logo from '../components/Logo';

const Privacy = () => {
    const navigate = useNavigate();
    const { theme, language } = useSettings();

    const isSpanish = language === 'es';

    const content = {
        title: isSpanish ? "Política de Privacidad" : "Privacy Policy",
        lastUpdated: isSpanish ? "Última actualización" : "Last updated",
        backHome: isSpanish ? "Volver al Inicio" : "Back to Home",
        sections: [
            {
                id: 1,
                title: isSpanish ? "1. Información que recolectamos" : "1. Information We Collect",
                icon: Shield,
                color: "text-blue-600",
                items: isSpanish ? [
                    "Recopilamos su nombre, correo electrónico y foto de perfil a través de la autenticación de Google.",
                    "Asociamos cada proyecto y sus respectivos escaneos con su identificador de usuario único.",
                    "Almacenamos los archivos de contexto que usted sube para la generación de estrategias de marca."
                ] : [
                    "We collect your name, email address, and profile picture via Google Authentication.",
                    "We associate each project and its respective scans with your unique user identifier.",
                    "We store content and context files that you explicitly upload to the platform for strategy generation."
                ],
                footer: isSpanish
                    ? "Usted es responsable de no subir datos sensibles de terceros sin el consentimiento preventivo."
                    : "You are responsible for ensuring that no sensitive third-party data is uploaded without consent."
            },
            {
                id: 2,
                title: isSpanish ? "2. Uso de Inteligencia Artificial (IA)" : "2. Use of Artificial Intelligence",
                icon: Zap,
                color: "text-purple-600",
                body: isSpanish
                    ? "Vult Intel utiliza modelos de Google Gemini (1.5 Pro, 1.5 Flash y modelos experimentales de Veo) para el análisis de marketing. Sus datos NO se utilizan para entrenar los modelos base de Google."
                    : "Vult Intel utilizes Google Gemini (1.5 Pro, 1.5 Flash, and Veo experimental models) for marketing intelligence. Your data is NOT used to train Google's foundational AI models."
            },
            {
                id: 3,
                title: isSpanish ? "3. Servicios de Terceros" : "3. Third-Party Services",
                icon: Globe,
                color: "text-green-600",
                items: isSpanish ? [
                    "Firebase (Google Cloud): Gestión de base de datos y autenticación segura.",
                    "Stripe: Procesamiento de pagos cifrado. No almacenamos datos de tarjetas.",
                    "Google Analytics: Monitoreo de eventos para mejorar la herramienta."
                ] : [
                    "Firebase (Google Cloud): For secure database management and authentication.",
                    "Stripe: For encrypted payment processing. We do not store card details.",
                    "Google Analytics: For monitoring usage events to improve the platform."
                ]
            },
            {
                id: 4,
                title: isSpanish ? "4. Seguridad y Retención" : "4. Security & Retention",
                icon: Lock,
                color: "text-orange-600",
                body: isSpanish
                    ? "Implementamos reglas de seguridad a nivel de servidor en Firestore para garantizar que solo usted acceda a sus proyectos. Los datos persisten hasta que usted decida eliminarlos."
                    : "We implement server-side security rules in Firestore to ensure only you can access your data. Data persists until you explicitly request its deletion."
            },
            {
                id: 5,
                title: isSpanish ? "5. Sus Derechos" : "5. Your Rights",
                icon: Eye,
                color: "text-rose-600",
                body: isSpanish
                    ? "Para ejercer sus derechos de acceso, rectificación o eliminación (derecho al olvido), contáctenos en:"
                    : "To exercise your rights of access, correction, or deletion (right to be forgotten), please contact us at:",
                email: "legal@vultintel.com"
            }
        ]
    };

    return (
        <div className={cn(
            "min-h-screen transition-colors duration-500",
            theme === 'dark' ? "bg-[#171b23] text-slate-50" : "bg-[#ffffff] text-slate-900"
        )}>
            {/* Navigation */}
            <nav className={cn(
                "fixed top-0 w-full z-50 border-b backdrop-blur-xl",
                theme === 'dark' ? "bg-[#171b23]/80 border-slate-900" : "bg-[#ffffff]/80 border-slate-200"
            )}>
                <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
                        <Logo className="h-14" dark={theme === 'dark'} />
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold",
                            theme === 'dark' ? "hover:bg-slate-900 text-slate-400 hover:text-white" : "hover:bg-white text-slate-500 hover:text-slate-900"
                        )}
                    >
                        <ArrowLeft size={18} />
                        {content.backHome}
                    </button>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-6 pt-32 pb-24">
                <header className="mb-16">
                    <h1 className="text-5xl font-black mb-6 tracking-tight">{content.title}</h1>
                    <p className={cn(
                        "text-xl leading-relaxed",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>
                        {content.lastUpdated}: {new Date().toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
                    </p>
                </header>

                <div className="space-y-12">
                    {content.sections.map((section) => (
                        <section key={section.id} className="space-y-4">
                            <div className={cn("flex items-center gap-3 mb-4", section.color)}>
                                <section.icon size={24} />
                                <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
                            </div>
                            <div className={cn(
                                "p-8 rounded-3xl space-y-4",
                                theme === 'dark' ? "bg-slate-900/50 border border-slate-800" : "bg-white shadow-xl shadow-slate-200/50 border border-slate-100"
                            )}>
                                {section.body && <p>{section.body}</p>}
                                {section.items && (
                                    <ul className="list-disc list-inside space-y-2 ml-4">
                                        {section.items.map((item, idx) => (
                                            <li key={idx}>{item}</li>
                                        ))}
                                    </ul>
                                )}
                                {section.footer && <p className="text-sm italic opacity-70">{section.footer}</p>}
                                {section.email && (
                                    <p><a href={`mailto:${section.email}`} className="font-bold text-blue-600 hover:underline">{section.email}</a></p>
                                )}
                            </div>
                        </section>
                    ))}

                    {/* Footer Contact */}
                    <footer className="mt-24 pt-12 border-t border-slate-200 dark:border-slate-800 text-center">
                        <p className={cn(
                            "text-sm font-bold uppercase tracking-[0.2em]",
                            theme === 'dark' ? "text-slate-500" : "text-slate-400"
                        )}>
                            © {new Date().getFullYear()} Vult Intel. {language === 'es' ? 'Creado para marketing de alto rendimiento.' : 'Built for high-performance marketing.'}
                        </p>
                    </footer>
                </div>
            </main>
        </div>
    );
};

export default Privacy;
