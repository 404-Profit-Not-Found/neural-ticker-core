import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { History, ChevronDown, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ModelBadge } from '../ui/model-badge';
import { cn } from '../../lib/utils';

interface Analysis {
  id: string;
  sentiment_score: number;
  sentiment_label: string;
  posts_analyzed: number;
  tokens_used: number;
  model_used: string;
  summary: string;
  highlights: {
    topics: string[];
    top_mentions: string[];
    bullish_points: string[];
    bearish_points: string[];
  };
  analysis_start: string;
  analysis_end: string;
  created_at: string;
}

interface HistorySelectorProps {
  history: Analysis[];
  currentId?: string;
  onSelect: (analysis: Analysis | null) => void;
}

export const HistorySelector = ({ history, currentId, onSelect }: HistorySelectorProps) => {
  const current = history.find(h => h.id === currentId) || history[0];

  if (!current) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 gap-2 bg-muted/10 border-border/40 hover:bg-muted/20 transition-all px-2.5 group rounded-lg"
        >
          <History className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-primary transition-colors" />
          <div className="flex flex-col items-start leading-none gap-0.5">
            <span className="text-[10px] font-bold text-foreground uppercase tracking-widest">
              {format(new Date(current.created_at), 'dd MMM, HH:mm')}
            </span>
            <span className="text-[8px] text-muted-foreground/60 uppercase font-black tracking-tight">
              {current.id === history[0]?.id ? 'Latest' : 'Historical'}
            </span>
          </div>
          <ChevronDown className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors ml-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1.5 bg-card border-border/40 shadow-xl rounded-xl" align="start">
        <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-1">
          {history.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                onSelect(h);
              }}
              className={cn(
                "w-full flex flex-col gap-1.5 p-3 rounded-lg text-left transition-all hover:bg-muted/30 group relative",
                h.id === currentId ? "bg-muted/50 ring-1 ring-inset ring-border/20" : ""
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-foreground uppercase tracking-widest">
                  {format(new Date(h.created_at), 'dd MMM, HH:mm')}
                </span>
                {h.id === history[0]?.id && (
                  <span className="text-[8px] uppercase font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                    Active
                  </span>
                )}
              </div>
              
              <div className="line-clamp-2 text-[11px] text-foreground/70 leading-relaxed font-medium">
                {h.summary}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <span className={cn(
                  "text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest",
                  h.sentiment_label === 'Bullish' ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-500' :
                  h.sentiment_label === 'Bearish' ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-500' :
                  'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-500'
                )}>
                  {h.sentiment_label}
                </span>
                <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60 font-bold uppercase tracking-widest">
                  <MessageSquare className="w-2.5 h-2.5" />
                  {h.posts_analyzed} POSTS
                </span>
                <div className="ml-auto">
                    <ModelBadge model={h.model_used} rarity="Common" className="h-4 text-[8px] px-1.5 border-border/40" showIcon={false} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
