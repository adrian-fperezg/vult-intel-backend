import React, { useMemo } from 'react';
import { Star, Reply, MoreVertical, ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface GmailPreviewProps {
  subject: string;
  bodyHtml: string;
  senderName?: string;
  senderEmail?: string;
  recipientEmail?: string;
  recipientData?: Record<string, any>;
  timestamp?: Date;
  className?: string;
}

export default function GmailPreview({
  subject,
  bodyHtml,
  senderName = "Adrian Perez",
  senderEmail = "adrian@vultintel.com",
  recipientEmail = "recipient@example.com",
  recipientData,
  timestamp = new Date(),
  className
}: GmailPreviewProps) {
  
  // Custom parsing for the preview
  const parsedSubject = useMemo(() => {
    return parseWithChips(subject || "(No Subject)", recipientData);
  }, [subject, recipientData]);

  const parsedBody = useMemo(() => {
    let body = bodyHtml || "<p>(Empty Body)</p>";
    return parseWithChips(body, recipientData);
  }, [bodyHtml, recipientData]);

  const initial = senderName.charAt(0).toUpperCase() || "A";
  const timeString = timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className={cn("bg-white text-[#202124] flex flex-col font-sans w-full h-full text-[14px]", className)}>
       <div className="px-6 py-5 flex items-center justify-between">
           <h1 
             className="text-[22px] font-normal text-[#1f1f1f] leading-snug"
             dangerouslySetInnerHTML={{ __html: parsedSubject }}
           />
       </div>

       <div className="px-6 py-2 flex items-start gap-4">
          <div className="size-10 rounded-full bg-[#1da1f2] flex items-center justify-center text-white font-medium text-lg shrink-0 overflow-hidden shadow-sm">
             {initial}
          </div>
          
          <div className="flex-1 min-w-0">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                   <span className="font-bold text-[#202124] text-[14px]">{senderName}</span>
                   <span className="text-[12px] text-[#5f6368]">&lt;{senderEmail}&gt;</span>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-[#5f6368]">
                   <span className="text-[12px]">{timeString}</span>
                   <div className="flex items-center gap-3">
                     <Star className="size-[18px] hover:bg-black/5 rounded-sm cursor-pointer p-0.5 transition-colors" />
                     <Reply className="size-[18px] hover:bg-black/5 rounded-sm cursor-pointer p-0.5 transition-colors" />
                     <MoreVertical className="size-[18px] hover:bg-black/5 rounded-sm cursor-pointer p-0.5 transition-colors" />
                   </div>
                </div>
             </div>
             
             <div className="flex items-center gap-1 mt-0.5 group w-fit cursor-pointer">
                <span className="text-[12px] text-[#5f6368]">to me</span>
                <ChevronDown className="size-3 text-[#5f6368] opacity-70 group-hover:opacity-100" />
             </div>
          </div>
       </div>

       <div className="px-[72px] pb-10 pt-4 flex-1 overflow-y-auto">
          <div className="prose prose-sm max-w-none text-[#202124] leading-[1.5] text-[14px] font-[Arial,Helvetica,sans-serif]"
               dangerouslySetInnerHTML={{ __html: parsedBody }} 
          />
          <div className="mt-6 flex items-center">
            <div className="w-8 h-8 rounded hover:bg-black/5 cursor-pointer flex items-center justify-center transition-colors">
               <span className="text-[#5f6368] tracking-widest leading-none translate-y-[-4px] text-lg">...</span>
            </div>
          </div>
       </div>
    </div>
  );
}

function parseWithChips(content: string, data?: Record<string, any>) {
   if (!content) return "";
   
   const norm: Record<string, any> = {};
   if (data) {
     Object.entries(data).forEach(([k,v]) => norm[k.toLowerCase()] = v);
     if (data.company) norm.company_name = data.company;
     if (data.first_name) norm.name = data.first_name;
   }

   return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, tag) => {
     const key = tag.trim().toLowerCase();
     
     // 1. Real data
     if (norm[key] !== undefined && norm[key] !== null && norm[key] !== "") {
       return String(norm[key]);
     }
     
     // 2. Chip fallback
     const display = key.replace(/_/g, ' ');
     return `<span class="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-bold bg-[#e8f0fe] text-[#1a73e8] border border-[#d2e3fc] shadow-sm transform translate-y-px" title="Variable: ${key}">${display}</span>`;
   });
}
