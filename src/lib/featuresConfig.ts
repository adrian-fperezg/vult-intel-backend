import { Search, Sparkles, Workflow, BrainCircuit, LucideIcon } from 'lucide-react';

export interface LandingFeatureConfig {
    id: string; // Used for translation key mapping: landing.features.[id].title / desc
    icon: LucideIcon;
    imgColor: string;
    iconColor: string;
    reverse: boolean;
    isNew: boolean;
}

export const featuresConfig: LandingFeatureConfig[] = [
    {
        id: 'feature1',
        icon: Search,
        imgColor: 'bg-blue-500/20',
        iconColor: 'text-blue-500',
        reverse: false,
        isNew: false
    },
    {
        id: 'feature2',
        icon: Sparkles,
        imgColor: 'bg-purple-500/20',
        iconColor: 'text-purple-500',
        reverse: true,
        isNew: false
    },
    {
        id: 'feature3',
        icon: Workflow,
        imgColor: 'bg-emerald-500/20',
        iconColor: 'text-emerald-500',
        reverse: false,
        isNew: false
    },
    {
        id: 'feature4',
        icon: BrainCircuit,
        imgColor: 'bg-rose-500/20',
        iconColor: 'text-rose-500',
        reverse: true,
        isNew: true // Destacando AI Chat Inyectado como 'Nuevo'
    }
];
