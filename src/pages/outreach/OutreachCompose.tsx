import React, { useState } from 'react';
import ComposeSidebar from './compose/ComposeSidebar';
import ComposeEditor from './compose/ComposeEditor';

export default function OutreachCompose() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<'draft' | 'scheduled' | 'sent'>('draft');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerSidebarRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="flex h-full bg-[#0a0d14]">
      {/* Sidebar: List of emails */}
      <ComposeSidebar 
        currentFolder={currentFolder} 
        setCurrentFolder={setCurrentFolder}
        selectedEmailId={selectedEmailId}
        setSelectedEmailId={setSelectedEmailId}
        refreshTrigger={refreshTrigger}
      />

      {/* Editor Area */}
      <div className="flex-1 flex flex-col bg-[#0a0d14]">
        {selectedEmailId ? (
          <ComposeEditor 
            emailId={selectedEmailId} 
            key={selectedEmailId} // Re-mount when email changes
            onClose={() => setSelectedEmailId(null)}
            refreshSidebar={triggerSidebarRefresh}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-xl tracking-tight text-white/40 font-medium mb-4">
                Select an email or start a new one
              </h3>
              <button 
                onClick={() => setSelectedEmailId('new')}
                className="px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold rounded-xl transition-colors shadow-[0_0_20px_rgba(20,184,166,0.15)] focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              >
                Compose New Email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
