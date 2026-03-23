import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { TranslationProvider } from './contexts/TranslationContext';
import { ProjectProvider } from './contexts/ProjectContext';

import { SettingsProvider } from './contexts/SettingsContext';

import ErrorBoundary from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TranslationProvider>
        <AuthProvider>
          <ProjectProvider>
            <DataProvider>
              <SettingsProvider>
                <App />
              </SettingsProvider>
            </DataProvider>
          </ProjectProvider>
        </AuthProvider>
      </TranslationProvider>
    </ErrorBoundary>
  </StrictMode>,
);
