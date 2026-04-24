import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Project, getProjectById, getProjects } from '@/services/scanService';
import { BrandVoice, BuyerPersona, ContentPillar, getBrandVoices, getBuyerPersonas, getContentPillars } from '@/services/brandStrategyService';
import { useAuth } from './AuthContext';

export interface ActiveProjectData {
    project: Project;
    voice: BrandVoice | null;
    personas: BuyerPersona[];
    pillars: ContentPillar[];
}

interface ProjectContextType {
    projects: Project[];
    activeProjectId: string | null;
    activeProject: ActiveProjectData | null;
    isLoading: boolean;
    selectProject: (projectId: string | null) => Promise<void>;
    refreshProjectData: () => Promise<void>;
    refreshProjectsList: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
    const { currentUser } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
        return localStorage.getItem('activeProjectId');
    });
    const [activeProject, setActiveProject] = useState<ActiveProjectData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const loadProjects = useCallback(async () => {
        if (!currentUser) return;
        try {
            const data = await getProjects();
            setProjects(data);
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }, [currentUser]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    const loadProjectData = useCallback(async (projectId: string) => {
        setIsLoading(true);
        try {
            const [projectResult, voicesResult, personasResult, pillarsResult] = await Promise.allSettled([
                getProjectById(projectId),
                getBrandVoices(projectId),
                getBuyerPersonas(projectId),
                getContentPillars(projectId)
            ]);

            const project = projectResult.status === 'fulfilled' ? projectResult.value : null;
            const voice = (voicesResult.status === 'fulfilled' && voicesResult.value.length > 0) ? voicesResult.value[0] : null;
            const personas = personasResult.status === 'fulfilled' ? personasResult.value : [];
            const pillars = pillarsResult.status === 'fulfilled' ? pillarsResult.value : [];

            if (project) {
                setActiveProject({
                    project,
                    voice,
                    personas,
                    pillars
                });
            } else {
                setActiveProject(null);
                setActiveProjectId(null);
                localStorage.removeItem('activeProjectId');
            }
        } catch (error) {
            console.error('Error loading project data:', error);
            setActiveProject(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeProjectId && currentUser) {
            loadProjectData(activeProjectId);
        } else if (!activeProjectId) {
            setActiveProject(null);
        }
    }, [activeProjectId, currentUser, loadProjectData]);

    const selectProject = useCallback(async (projectId: string | null) => {
        setIsLoading(true);
        setActiveProject(null); // Clear state immediately as requested to prevent data mix-ups

        if (projectId) {
            setActiveProjectId(projectId);
            localStorage.setItem('activeProjectId', projectId);
            await loadProjectData(projectId);
        } else {
            setActiveProjectId(null);
            localStorage.removeItem('activeProjectId');
        }
        setIsLoading(false);
    }, [loadProjectData]);

    const refreshProjectData = useCallback(async () => {
        if (activeProjectId) {
            await loadProjectData(activeProjectId);
        }
    }, [activeProjectId, loadProjectData]);

    const refreshProjectsList = useCallback(async () => {
        await loadProjects();
    }, [loadProjects]);

    const value = useMemo(() => ({
        projects,
        activeProjectId,
        activeProject,
        isLoading,
        selectProject,
        refreshProjectData,
        refreshProjectsList
    }), [projects, activeProjectId, activeProject, isLoading, selectProject, refreshProjectData, refreshProjectsList]);

    return (
        <ProjectContext.Provider value={value}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
