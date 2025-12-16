import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Sparkles, Newspaper, Calendar, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MiniTickerTile } from './MiniTickerTile';

interface NewsItem {
    id: number;
    category: string;
    datetime: number;
    headline: string;
    image: string;
    related: string;
    source: string;
    summary: string;
    url: string;
}

interface ResearchNote {
    id: string;
    title?: string;
    answer_markdown?: string;
    created_at: string;
    relatedTickers?: {
        id: string;
        symbol: string;
        name: string;
        latestPrice?: { close: number; changePercent?: number };
        riskAnalysis?: { overall_score: number; financial_risk?: number };
    }[];
    models_used?: string[];
    tokens_in?: number;
    tokens_out?: number;
}

export function NewsFeed() {
    const [digest, setDigest] = useState<ResearchNote | null>(null);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loadingDigest, setLoadingDigest] = useState(true);
    const [loadingNews, setLoadingNews] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            // 1. Fetch Digest
            try {
                const res = await api.get('/news/digest');
                if (res.data && res.data.id) {
                    setDigest(res.data);
                }
            } catch {
                console.error("Failed to load news");
            } finally {
                setLoadingDigest(false);
            }

            // 2. Fetch General News
            try {
                const res = await api.get('/news/general');
                if (Array.isArray(res.data)) {
                    setNews(res.data.slice(0, 20)); // Limit to 20 items
                }
            } catch (e) {
                console.error("Failed to fetch general news", e);
            } finally {
                setLoadingNews(false);
            }
        };

        fetchData();
    }, []);

    const formatDate = (ts: number | string) => {
        if (!ts) return 'Just now';
        try {
            let date: Date;
            // Handle number (unix timestamp)
            if (typeof ts === 'number') {
                // Finnhub returns seconds, but check if it's ms (huge number)
                date = new Date(ts > 10000000000 ? ts : ts * 1000);
            } else {
                // Handle string (ISO or other formats)
                date = new Date(ts);
            }

            if (isNaN(date.getTime())) return 'Recently';
            
            return date.toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return 'Recently';
        }
    };

    // Helper to colorize sentiment tags in any text
    const renderWithSentiment = (children: React.ReactNode): React.ReactNode[] => {
        const content = Array.isArray(children) ? children : [children];
        return content.map((child: React.ReactNode, i: number) => {
            if (typeof child === 'string') {
                // Split by sentiment tags (case-insensitive)
                const parts = child.split(/(\((?:BULLISH|BEARISH|MIXED|NEUTRAL)\))/gi);
                return parts.map((part, j) => {
                    const upper = part.toUpperCase();
                    if (upper === '(BULLISH)') return <span key={`s-${i}-${j}`} className="text-green-500 dark:text-green-400 font-bold">{part}</span>;
                    if (upper === '(BEARISH)') return <span key={`s-${i}-${j}`} className="text-red-500 dark:text-red-400 font-bold">{part}</span>;
                    if (upper === '(MIXED)' || upper === '(NEUTRAL)') return <span key={`s-${i}-${j}`} className="text-yellow-500 dark:text-yellow-400 font-bold">{part}</span>;
                    return part;
                });
            }
            return child;
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-full">
            {/* AI DIGEST CARD (Left - 3/5 width - PROMINENT BUT CLEAN) */}
            <Card className="lg:col-span-3 flex flex-col overflow-hidden border-border/50 shadow-sm bg-transparent min-h-[50vh] md:min-h-0">
                <CardHeader className="py-4 border-b border-border/50 bg-transparent">
                    <CardTitle className="text-base font-bold flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" />
                            AI Market Digest
                        </div>
                        {digest && digest.models_used && (
                            <div className="flex items-center gap-2">
                                {digest.models_used.map(model => (
                                    <Badge key={model} variant="outline" className="text-[10px] h-5 px-1.5 font-normal bg-white/5 text-white/90 border-white/20 hover:bg-white/10">
                                        {model}
                                    </Badge>
                                ))}
                                {digest.tokens_out && (
                                    <span className="text-[10px] text-muted-foreground font-normal">
                                        {digest.tokens_out + (digest.tokens_in || 0)} tokens
                                    </span>
                                )}
                            </div>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-6 min-h-[80vh] md:min-h-0">
                    {loadingDigest ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" /> Generated just now...
                        </div>
                    ) : digest ? (
                        <div className="space-y-4">
                            {/* RELATED TICKERS MINI-CARDS (TOP) */}
                            {digest.relatedTickers && digest.relatedTickers.length > 0 && (
                                <div className="mb-6 pb-4 border-b border-border/50">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                                        {digest.relatedTickers.map((t: { id: string; symbol: string; name: string; latestPrice?: { close: number; changePercent?: number }; riskAnalysis?: { overall_score: number; financial_risk?: number } }) => (
                                            <MiniTickerTile
                                                key={t.id}
                                                symbol={t.symbol}
                                                company={t.name}
                                                price={Number(t.latestPrice?.close || 0)}
                                                change={Number(t.latestPrice?.changePercent || 0)}
                                                riskScore={t.riskAnalysis?.financial_risk ?? t.riskAnalysis?.overall_score ?? 0}
                                                href={`/ticker/${t.symbol}`}
                                            />
                                        ))}

                                    </div>
                                </div>
                            )}

                            <h3 className="font-semibold text-xl leading-tight tracking-tight text-foreground">
                                {digest.title}
                            </h3>
                            <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-blue-400 prose-img:rounded-lg prose-strong:text-foreground prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/20 prose-blockquote:py-1 prose-blockquote:px-4 prose-hr:border-border prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:border prose-pre:border-border">
                                <ReactMarkdown
                                    components={{
                                        a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="hover:text-blue-300 transition-colors" />,
                                        strong: ({ ...props }) => <strong className="font-bold">{renderWithSentiment(props.children)}</strong>,
                                        em: ({ ...props }) => <em className="italic">{renderWithSentiment(props.children)}</em>,
                                        p: ({ ...props }) => <p>{renderWithSentiment(props.children)}</p>,
                                        li: ({ ...props }) => <li>{renderWithSentiment(props.children)}</li>,
                                        h1: ({ ...props }) => <h1>{renderWithSentiment(props.children)}</h1>,
                                        h2: ({ ...props }) => <h2>{renderWithSentiment(props.children)}</h2>,
                                        h3: ({ ...props }) => <h3>{renderWithSentiment(props.children)}</h3>,
                                        h4: ({ ...props }) => <h4>{renderWithSentiment(props.children)}</h4>,
                                        h5: ({ ...props }) => <h5>{renderWithSentiment(props.children)}</h5>,
                                        h6: ({ ...props }) => <h6>{renderWithSentiment(props.children)}</h6>,
                                    }}
                                    remarkPlugins={[remarkGfm]}
                                >
                                    {digest.answer_markdown || "No content available."}
                                </ReactMarkdown>
                            </article>

                            <div className="pt-4 flex justify-between items-center border-t border-border/50 mt-4">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                                    {new Date(digest.created_at).toLocaleDateString(undefined, {
                                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                </span>
                            </div>

                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground italic">
                            Digest arriving soon...
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* GENERAL NEWS FEED (Right - 2/5 width - Hidden on mobile) */}
            <Card className="hidden lg:flex lg:col-span-2 flex-col border-border/50 shadow-sm overflow-hidden bg-transparent">
                <CardHeader className="py-4 border-b border-border/50 bg-transparent">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Newspaper className="w-4 h-4 text-primary" />
                        Live Market News
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0 hover:scrollbar-thumb-muted/50 scrollbar-thin scrollbar-track-transparent">
                    {loadingNews ? (
                        <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
                    ) : news.length > 0 ? (
                        <div className="divide-y divide-border/40">
                            {news.map((item) => (
                                <div key={item.id} className="p-4 hover:bg-muted/30 transition-colors group">
                                    <div className="flex gap-4">
                                        {item.image && (
                                            <div className="shrink-0 w-32 h-24 rounded-md overflow-hidden bg-muted relative border border-border/50">
                                                <img
                                                    src={item.image}
                                                    alt="News"
                                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground border-border/50 bg-background/50">
                                                        {item.source}
                                                    </Badge>
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
                                                        {formatDate(item.datetime)}
                                                    </span>
                                                </div>
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-base font-semibold leading-snug hover:text-primary transition-colors block line-clamp-2"
                                                >
                                                    {item.headline}
                                                </a>
                                                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                    {item.summary}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-12 text-center text-muted-foreground text-sm">
                            No recent news found.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
