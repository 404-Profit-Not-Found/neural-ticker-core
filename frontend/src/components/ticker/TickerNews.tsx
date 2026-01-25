
import { useMemo } from 'react';
import { Newspaper } from 'lucide-react';
import type { NewsItem } from '../../types/ticker';


interface TickerNewsProps {
    news: NewsItem[];
}

export function TickerNews({ news }: TickerNewsProps) {
    const sortedNews = useMemo(() => {
        if (!news) return [];
        // Sort descending (newest first) and take top 10
        return [...news]
            .sort((a, b) => b.datetime - a.datetime)
            .slice(0, 10);
    }, [news]);

    return (
        <div className="divide-y divide-border/50">
            {sortedNews && sortedNews.length > 0 ? (
                sortedNews.map((item) => (
                    <div key={item.id} className="bg-background hover:bg-muted/50 transition-colors rounded-lg my-1 border border-transparent hover:border-border/40">
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 flex items-center justify-between group block"
                        >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500/80" />
                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                    <div className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors leading-snug">
                                        {item.headline}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground uppercase tracking-wider border border-border/50">
                                            {item.source}
                                        </div>
                                        <span className="text-muted-foreground text-[10px]">•</span>
                                        <span className="text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap">
                                            {(() => {
                                                let d: Date;
                                                if (typeof item.datetime === 'string') {
                                                    d = new Date(item.datetime);
                                                } else {
                                                    if (item.datetime < 10000000000) d = new Date(item.datetime * 1000);
                                                    else d = new Date(item.datetime);
                                                }
                                                
                                                if (isNaN(d.getTime())) return 'Recently';

                                                return d.toLocaleDateString(undefined, { 
                                                    month: 'short', 
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </a>
                    </div>
                ))
            ) : (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-40">
                    <Newspaper className="w-8 h-8 opacity-20 mb-3" />
                    <p className="text-sm">No recent news found.</p>
                </div>
            )}
        </div>
    );
}
