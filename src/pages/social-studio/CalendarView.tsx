import { useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarViewProps {
  posts: any[];
  loading: boolean;
}

export default function CalendarView({ posts, loading }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getPostsForDay = (day: Date) =>
    posts.filter(p => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), day));

  const STATUS_DOT: Record<string, string> = {
    scheduled: 'bg-violet-500', published: 'bg-emerald-500',
    draft: 'bg-slate-500', failed: 'bg-red-500',
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold text-white">{format(currentMonth, 'MMMM yyyy')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1))}
              className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >Today</button>
            <button
              onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1))}
              className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wider py-2">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
          {days.map(day => {
            const dayPosts = getPostsForDay(day);
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "bg-[#0d1117] min-h-[100px] p-2 relative",
                  !isCurrentMonth && "opacity-30",
                  today && "bg-violet-500/5"
                )}
              >
                <div className={cn(
                  "text-xs font-semibold mb-1.5 size-6 flex items-center justify-center rounded-full",
                  today ? "bg-violet-500 text-white" : "text-slate-500"
                )}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {dayPosts.slice(0, 3).map(post => {
                    const targets = typeof post.targets === 'string' ? JSON.parse(post.targets) : (post.targets || []);
                    return (
                      <div key={post.id} className="flex items-start gap-1">
                        <div className={cn("size-1.5 rounded-full mt-0.5 shrink-0", STATUS_DOT[post.status] || 'bg-slate-500')} />
                        <span className="text-[10px] text-slate-400 leading-tight line-clamp-1">{post.body}</span>
                      </div>
                    );
                  })}
                  {dayPosts.length > 3 && (
                    <p className="text-[10px] text-slate-600">+{dayPosts.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
