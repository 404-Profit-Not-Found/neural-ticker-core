
import { Newspaper } from 'lucide-react';
import type { NewsItem } from '../../types/ticker';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface TickerNewsProps {
    news: NewsItem[];
}

export function TickerNews({ news }: TickerNewsProps) {
    return (
        <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="py-4 border-b border-border bg-muted/10">
                <CardTitle className="font-bold text-sm flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-primary" /> Global News Feed
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto">
                <div className="divide-y divide-border/50">
                    {news && news.length > 0 ? (
                        news.map((item) => (
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
                                                <span className="text-xs font-bold uppercase text-muted-foreground">
                                                    {new Date(item.datetime * 1000).toLocaleDateString()}
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
