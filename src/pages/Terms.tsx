import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Scale, ShieldAlert, CreditCard, UserCheck, Package, Copyright } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../lib/utils';
import Logo from '../components/Logo';

export default function Terms() {
    const { theme, language } = useSettings();
    const navigate = useNavigate();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const content = {
        es: {
            title: "Términos de Servicio",
            lastUpdated: "Última actualización: 3 de marzo de 2026",
            back: "Volver al Inicio",
            sections: [
                {
                    icon: <Copyright className="size-5" />,
                    title: "1. Propiedad Intelectual (IP)",
                    content: "El usuario es el propietario único de todos los resultados generados (estrategias, copys, planes de contenido). Vult Intel no reclama derechos sobre el contenido producido por el cliente mediante la plataforma."
                },
                {
                    icon: <Scale className="size-5" />,
                    title: "2. Uso Aceptable",
                    content: "Queda estrictamente prohibido el uso de la plataforma para generar spam, realizar scraping masivo no autorizado (fuera de la función Deep Scan), o el uso de bots para automatizar consultas que degraden el servicio. No se permite la reventa del acceso a la cuenta."
                },
                {
                    icon: <ShieldAlert className="size-5" />,
                    title: "3. Responsabilidad de la IA",
                    content: "El usuario reconoce que los resultados de Deep Scan y análisis de mercado son de carácter informativo y pueden contener imprecisiones debido a las limitaciones actuales de la IA (alucinaciones o datos desactualizados). Es responsabilidad del usuario verificar la información antes de tomar decisiones comerciales."
                },
                {
                    icon: <CreditCard className="size-5" />,
                    title: "4. Pagos y Reembolsos",
                    content: "Debido a los costos directos de infraestructura y tokens de IA, Vult Intel no ofrece pruebas gratuitas. Todas las ventas son finales; no se ofrecen reembolsos ya que los pagos cubren el procesamiento inmediato de datos en la nube. La cancelación evita el próximo cargo, pero no genera devoluciones prorrateadas."
                },
                {
                    icon: <UserCheck className="size-5" />,
                    title: "5. Límites de Cuenta",
                    content: "El acceso es personal e intransferible. No se permite compartir credenciales de acceso; cada cuenta está vinculada a un identificador único en nuestra base de datos."
                },
                {
                    icon: <Package className="size-5" />,
                    title: "6. Funciones Experimentales",
                    content: "Al utilizar modelos etiquetados como 'experimental' o 'preview', el usuario acepta que estas funciones pueden ser inestables, cambiar o ser retiradas sin previo aviso."
                },
                {
                    icon: <Scale className="size-5" />,
                    title: "7. Entidad Legal y Jurisdicción",
                    content: "Vult Intel se rige bajo las leyes vigentes en [Pendiente: Ciudad/País]. Cualquier disputa legal será resuelta en los tribunales correspondientes a dicha jurisdicción."
                }
            ]
        },
        en: {
            title: "Terms of Service",
            lastUpdated: "Last updated: March 3, 2026",
            back: "Back to Home",
            sections: [
                {
                    icon: <Copyright className="size-5" />,
                    title: "1. Intellectual Property (IP)",
                    content: "The user is the sole owner of all generated results (strategies, copy, content plans). Vult Intel does not claim rights to the content produced by the client through the platform."
                },
                {
                    icon: <Scale className="size-5" />,
                    title: "2. Acceptable Use",
                    content: "It is strictly forbidden to use the platform to generate spam, perform unauthorized bulk scraping (outside the Deep Scan function), or use bots to automate queries that degrade the service. Resale of account access is not permitted."
                },
                {
                    icon: <ShieldAlert className="size-5" />,
                    title: "3. AI Responsibility",
                    content: "The user acknowledges that Deep Scan and market analysis results are informational and may contain inaccuracies due to current AI limitations (hallucinations or outdated data). It is the user's responsibility to verify information before making business decisions."
                },
                {
                    icon: <CreditCard className="size-5" />,
                    title: "4. Payments and Refunds",
                    content: "Due to direct infrastructure and AI token costs, Vult Intel does not offer free trials. All sales are final; no refunds are offered as payments cover immediate cloud data processing. Cancellation prevents the next charge but does not generate prorated refunds."
                },
                {
                    icon: <UserCheck className="size-5" />,
                    title: "5. Account Limits",
                    content: "Access is personal and non-transferable. Sharing access credentials is not allowed; each account is linked to a unique identifier in our database."
                },
                {
                    icon: <Package className="size-5" />,
                    title: "6. Experimental Features",
                    content: "By using models labeled as 'experimental' or 'preview', the user accepts that these features may be unstable, change, or be withdrawn without notice."
                },
                {
                    icon: <Scale className="size-5" />,
                    title: "7. Legal Entity and Jurisdiction",
                    content: "Vult Intel is governed by the laws in force in [Pending: City/Country]. Any legal dispute will be resolved in the courts corresponding to said jurisdiction."
                }
            ]
        }
    };

    const t = language === 'es' ? content.es : content.en;

    return (
        <div className={cn("min-h-screen transition-colors duration-300", theme === 'dark' ? "bg-[#171b23] text-slate-100" : "bg-[#ffffff] text-slate-900")}>
            <div className="max-w-4xl mx-auto px-6 py-12 md:py-20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16">
                    <div className="flex items-center gap-6">
                        <Logo className="h-[4.2rem] w-auto" dark={theme === 'dark'} />
                        <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden md:block" />
                        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className={cn("inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-blue-500", theme === 'dark' ? "text-slate-400" : "text-slate-500")}
                    >
                        <ArrowLeft className="size-4" />
                        {t.back}
                    </button>
                </div>

                <div className="mb-12">
                    <p className={cn("text-sm font-medium", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                        {t.lastUpdated}
                    </p>
                </div>

                <div className="grid gap-12">
                    {t.sections.map((section, idx) => (
                        <div key={idx} className="group">
                            <div className="flex items-center gap-3 mb-4">
                                <div className={cn("p-2 rounded-lg", theme === 'dark' ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600")}>
                                    {section.icon}
                                </div>
                                <h2 className="text-xl font-bold tracking-tight">{section.title}</h2>
                            </div>
                            <div className={cn("pl-11 pr-4 py-6 rounded-2xl border transition-all hover:shadow-lg", theme === 'dark' ? "bg-slate-900/50 border-slate-800 hover:border-slate-700" : "bg-white border-slate-200 hover:border-slate-300")}>
                                <p className={cn("leading-relaxed", theme === 'dark' ? "text-slate-300" : "text-slate-600")}>
                                    {section.content}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-20 pt-8 border-t border-slate-200 dark:border-slate-800 text-center">
                    <p className={cn("text-sm font-bold uppercase tracking-[0.3em]", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                        © 2026 VULT INTEL. BUILT FOR HIGH-PERFORMANCE MARKETING.
                    </p>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 opacity-20 pointer-events-none" />
        </div>
    );
}
