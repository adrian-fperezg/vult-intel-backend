import React from 'react';
import { Paperclip, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  variables?: string[];
  className?: string;
  placeholder?: string;
}

export default function EmailEditor({ 
  value, 
  onChange, 
  disabled = false, 
  variables = ['first_name', 'last_name', 'company', 'title'],
  className,
  placeholder = "Write your email here..."
}: EmailEditorProps) {
  
  const insertVariable = (v: string) => {
    onChange(value + `{{${v}}}`);
  };

  return (
    <div className={cn("flex flex-col h-[400px] space-y-1.5", className)}>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 w-full bg-[#161b22] border border-[#30363d] focus:border-teal-500/50 rounded-xl p-4 text-sm text-slate-300 focus:outline-none transition-colors disabled:opacity-50 resize-none font-mono"
      />
      
      {/* Editor Toolbar */}
      <div className="flex items-center gap-2 mt-2 px-1">
        <button 
          disabled 
          className="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-white/5 transition-colors disabled:opacity-50" 
          title="Attachments coming soon"
        >
          <Paperclip className="size-4" />
        </button>
        
        {variables.length > 0 && (
          <div className="relative group">
            <button 
              type="button" 
              disabled={disabled} 
              className="p-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <Type className="size-3.5" /> Insert Variable
            </button>
            <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-10 w-40 overflow-hidden">
              {variables.map(v => (
                <button 
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-teal-500/10 hover:text-white transition-colors"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <span className="text-[10px] text-slate-500 font-semibold tracking-wider text-right uppercase ml-auto">HTML Output</span>
      </div>
    </div>
  );
}
