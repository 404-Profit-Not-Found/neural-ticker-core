import { useQuery } from '@tanstack/react-query';
import { Newspaper, ExternalLink, Calendar, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';

interface NewsItem {
    id: string | number;
    headline: string;
    source: string;
    url: string;
    image?: string;
    image_url?: string;
    datetime: number;
}

export function NewsPage() {
    const { data: news, isLoading } = useQuery<NewsItem[]>({
        queryKey: ['news', 'general'],
        queryFn: async () => {
            const { data } = await api.get('/news/general');
            return data;
        },
        staleTime: 60000 * 5, // 5 min
    });

    const formatDate = (ts: number | string) => {
        if (!ts) return 'Recently';
        try {
            const val = typeof ts === 'string' ? parseFloat(ts) : ts;
            const date = new Date(val > 10000000000 ? val : val * 1000);
            
            if (isNaN(date.getTime())) return 'Recently';

            return date.toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return 'Recently';
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <main className="container max-w-4xl mx-auto px-4 py-6">
                <Card className="border-border/50">
                    <CardHeader className="pb-4 border-b border-border/50">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <Newspaper className="w-5 h-5 text-primary" />
                            Live Market News
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12 text-muted-foreground">
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Loading news...
                            </div>
                        ) : !news || news.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                No news available at the moment.
                            </div>
                        ) : (
                            <div className="divide-y divide-border/50">
                                {news.map((item) => (
                                    <a
                                        key={item.id}
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex gap-4 p-4 hover:bg-muted/30 transition-colors group"
                                    >
                                        {(item.image || item.image_url) && (
                                            <img
                                                src={item.image || item.image_url}
                                                alt=""
                                                className="w-20 h-16 md:w-28 md:h-20 object-cover rounded-md shrink-0 bg-muted"
                                                loading="lazy"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                                                <span className="font-medium bg-muted/50 px-1.5 py-0.5 rounded">
                                                    {item.source}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={10} />
                                                    {formatDate(item.datetime)}
                                                </span>
                                            </div>
                                            <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                                                {item.headline}
                                            </h3>
                                            <span className="text-[10px] text-primary/80 flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                Read more <ExternalLink size={10} />
                                            </span>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
