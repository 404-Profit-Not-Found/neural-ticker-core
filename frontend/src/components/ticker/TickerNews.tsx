
import { Newspaper } from 'lucide-react';
import type { NewsItem } from '../../types/ticker';

interface TickerNewsProps {
    news: NewsItem[];
}

export function TickerNews({ news }: TickerNewsProps) {
    return (
        <div className="bg-card border border-border rounded-lg shadow-sm">
            <div className="p-4 border-b border-border bg-muted/10 font-bold flex items-center gap-2 text-sm">
                <Newspaper size={14} /> Global News Feed
            </div>
            <div className="divide-y divide-border/50">
                {news.length > 0 ? news.map((item: NewsItem) => (
                    <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-4 hover:bg-muted/5 transition-colors group"
                    >
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-1">
                            <h4 className="text-base font-medium leading-snug group-hover:text-primary transition-colors">
                                {item.headline}
                            </h4>
                            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {new Date(item.datetime * 1000).toLocaleString()}
                            </span>
                        </div>
                        <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider text-primary/80">
                            {item.source}
                        </div>
                    </a>
                )) : (
                    <div className="p-12 text-center text-muted-foreground">No recent news found for this ticker.</div>
                )}
            </div>
        </div>
    );
}
