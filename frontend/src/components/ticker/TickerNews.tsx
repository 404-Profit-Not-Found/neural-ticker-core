
import { useMemo } from 'react';
import { Newspaper } from 'lucide-react';
import type { NewsItem } from '../../types/ticker';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

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
        <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="py-4 border-b border-border bg-muted/10">
                <CardTitle className="font-bold text-sm flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-primary" /> Most Recent News (Top 10)
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto">
                <div className="divide-y divide-border/50">
                    {sortedNews && sortedNews.length > 0 ? (
                        sortedNews.map((item) => (
                            <div key={item.id} className="bg-background hover:bg-muted/50 transition-colors">
                                <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-4 flex items-center justify-between group block"
                                >
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
                                                    {item.headline}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold uppercase text-muted-foreground whitespace-nowrap">
                                                    {(() => {
                                                        let d: Date;
                                                        if (typeof item.datetime === 'string') {
                                                            d = new Date(item.datetime);
                                                        } else {
                                                            // Assume seconds if < 10000000000, else ms
                                                            if (item.datetime < 10000000000) d = new Date(item.datetime * 1000);
                                                            else d = new Date(item.datetime);
                                                        }
                                                        
                                                        if (isNaN(d.getTime())) return 'Recently';

                                                        // Format: "Jan 10, 14:00"
                                                        return d.toLocaleDateString(undefined, { 
                                                            month: 'short', 
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        });
                                                    })()}
                                                </span>
                                                <span className="text-muted-foreground text-xs">•</span>

                                                <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
                                                    {item.source}
                                                </div>
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
            </CardContent>
        </Card>
    );
}
