import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  Link as LinkIcon, 
  List, 
  ListOrdered, 
  Type,
  Sparkles,
  Undo,
  Redo,
  CloudLightning,
  Paperclip,
  Eye,
  PenLine
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Variable {
  key: string;
  label: string;
  type: 'standard' | 'custom_field' | 'snippet';
}

interface TipTapEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  variables?: (string | Variable)[];
  className?: string;
  placeholder?: string;
  onOptimize?: () => void;
  isOptimizing?: boolean;
  onAttachFile?: () => void;
  onPreview?: () => void;
}

const MenuButton = ({ 
  onClick, 
  isActive = false, 
  disabled = false, 
  children, 
  title 
}: { 
  onClick: () => void; 
  isActive?: boolean; 
  disabled?: boolean; 
  children: React.ReactNode;
  title: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      "p-1.5 rounded transition-colors disabled:opacity-50",
      isActive 
        ? "bg-teal-500/20 text-teal-400" 
        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
    )}
  >
    {children}
  </button>
);

export default function TipTapEditor({ 
  value, 
  onChange, 
  disabled = false, 
  variables = [],
  className,
  placeholder = "Write your email here...",
  onOptimize,
  isOptimizing = false,
  onPreview,
  onAttachFile
}: TipTapEditorProps) {
  const [showVariables, setShowVariables] = React.useState(false);
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editable: !disabled,
  });

  // Sync value from props if it changes externally (e.g. AI optimization)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  const insertVariable = (v: string) => {
    editor.chain().focus().insertContent(`{{${v}}}`).run();
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  // Group variables by type
  const groupedVariables = (variables || []).reduce((acc, v) => {
    const varObj = typeof v === 'string' ? { key: v, label: v, type: 'standard' as const } : v;
    const type = varObj.type || 'standard';
    if (!acc[type]) acc[type] = [];
    acc[type].push(varObj);
    return acc;
  }, {} as Record<string, Variable[]>);

  const categories = [
    { type: 'standard', label: 'Standard Fields' },
    { type: 'custom_field', label: 'Custom Fields' },
    { type: 'snippet', label: 'Snippets (Rich Text)' }
  ];

  return (
    <div className={cn(
      "flex flex-col min-h-[400px] bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden focus-within:border-teal-500/50 transition-colors",
      className,
      disabled && "opacity-60 pointer-events-none"
    )}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-bottom border-[#30363d] bg-[#0d1117]/50">
        <MenuButton 
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold"
        >
          <Bold className="size-4" />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic"
        >
          <Italic className="size-4" />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Underline"
        >
          <UnderlineIcon className="size-4" />
        </MenuButton>
        
        <div className="w-px h-4 bg-[#30363d] mx-1" />

        <MenuButton 
          onClick={setLink}
          isActive={editor.isActive('link')}
          title="Insert Link"
        >
          <LinkIcon className="size-4" />
        </MenuButton>

        <MenuButton 
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="size-4" />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Ordered List"
        >
          <ListOrdered className="size-4" />
        </MenuButton>

        <div className="w-px h-4 bg-[#30363d] mx-1" />

        <MenuButton 
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
        >
          <Undo className="size-4" />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
        >
          <Redo className="size-4" />
        </MenuButton>

        <MenuButton 
          onClick={() => editor.chain().focus().insertContent('{{signature}}').run()}
          title="Insert Signature"
        >
          <PenLine className="size-4" />
        </MenuButton>

        {onAttachFile && (
          <MenuButton 
            onClick={onAttachFile}
            title="Attach File"
          >
            <Paperclip className="size-4" />
          </MenuButton>
        )}

        <div className="ml-auto flex items-center gap-2">
          {onOptimize && (
            <button
              onClick={onOptimize}
              disabled={isOptimizing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-500/20 to-blue-500/20 hover:from-teal-500/30 hover:to-blue-500/30 border border-teal-500/30 text-teal-400 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {isOptimizing ? (
                <div className="size-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {isOptimizing ? "Optimizing..." : "AI Optimize"}
            </button>
          )}

          {onPreview && (
            <button
              onClick={onPreview}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-[#30363d] text-slate-300 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
            >
              <Eye className="size-3.5" />
              Preview
            </button>
          )}

          {variables.length > 0 && (
            <div className="relative">
              <button 
                type="button" 
                onClick={() => setShowVariables(!showVariables)}
                className={cn(
                  "p-1.5 flex items-center gap-1.5 text-xs font-semibold rounded transition-colors",
                  showVariables ? "bg-teal-500/20 text-teal-400" : "text-slate-400 hover:text-teal-400 hover:bg-white/5"
                )}
              >
                <Type className="size-3.5" /> Variables
              </button>
              {showVariables && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowVariables(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-20 w-56 overflow-hidden animate-in fade-in slide-in-from-top-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {categories.map(cat => {
                      const items = groupedVariables[cat.type];
                      if (!items || items.length === 0) return null;
                      return (
                        <div key={cat.type} className="border-b border-[#30363d] last:border-0 pb-1">
                          <div className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500 bg-white/5">
                            {cat.label}
                          </div>
                          {items.map(v => (
                            <button 
                              key={v.key}
                              type="button"
                              onClick={() => {
                                insertVariable(v.key);
                                setShowVariables(false);
                              }}
                              className="group block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-teal-500/10 hover:text-white transition-all flex items-center justify-between"
                            >
                              <span className="truncate">{v.label}</span>
                              <span className="text-[8px] font-mono text-slate-600 group-hover:text-teal-500/50">
                                {`{{${v.key}}}`}
                              </span>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Editor Content */}
      <div className="flex-1 p-4 prose prose-invert prose-sm max-w-none focus:outline-none overflow-y-auto custom-scrollbar">
        <EditorContent editor={editor} />
      </div>

      {/* Footer / Status */}
      <div className="px-4 py-2 border-t border-[#30363d] bg-[#0d1117]/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <CloudLightning className="size-3 text-teal-500/50" />
           <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Rich Text Mode</span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">
          {value.replace(/<[^>]*>?/gm, '').length} characters
        </span>
      </div>

      <style>{`
        .ProseMirror {
          min-height: 300px;
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #484f58;
          pointer-events: none;
          height: 0;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3e444d;
        }
      `}</style>
    </div>
  );
}
