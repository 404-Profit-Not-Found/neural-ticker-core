import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Sparkles, Newspaper, Calendar, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MiniTickerTile } from './MiniTickerTile';
import { ModelBadge } from '../ui/model-badge';
import { useWatchlists } from '../../hooks/useWatchlist';

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
        latestPrice?: { close: number; changePercent?: number; change?: number };
        riskAnalysis?: { overall_score: number; financial_risk?: number };
    }[];
    models_used?: string[];
    tokens_in?: number;
    tokens_out?: number;
}

export function NewsFeed({ tickerCount }: { tickerCount?: number }) {
    const [digest, setDigest] = useState<ResearchNote | null>(null);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loadingDigest, setLoadingDigest] = useState(true);
    const [loadingNews, setLoadingNews] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    // Check if user has watchlist items
    const { data: watchlists = [] } = useWatchlists();
    const watchlistItemCount = watchlists.reduce((acc, wl) => acc + (wl.items?.length || 0), 0);
    const [portfolioCount, setPortfolioCount] = useState(0);
    const hasItems = watchlistItemCount > 0 || portfolioCount > 0;

    // Fetch portfolio count
    useEffect(() => {
        const fetchPortfolioCount = async () => {
            try {
                const res = await api.get('/portfolio/positions');
                if (Array.isArray(res.data)) {
                    setPortfolioCount(res.data.length);
                }
            } catch {
                // Silently fail - portfolio count is optional display
            }
        };
        fetchPortfolioCount();
    }, []);



    // Auto-trigger digest ONLY for returning users (who have a previous digest)
    // If digest is null, it's a new user -> Wait for manual button click.
    // If digest exists but is old -> Auto-generate today's.
    useEffect(() => {
        if (!loadingDigest && digest && !isGenerating && hasItems) {
            const digestDate = new Date(digest.created_at).setHours(0, 0, 0, 0);
            const today = new Date().setHours(0, 0, 0, 0);

            if (digestDate < today) {
                console.log("Returning user with old digest - Auto-generating for today...");
                triggerDigest();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadingDigest, digest, isGenerating, hasItems]);

    const fetchDigest = async () => {
        try {
            const res = await api.get('/news/digest');
            if (res.data && res.data.id) {
                setDigest(res.data);
            }
        } catch {
            console.error("Failed to load digest");
        } finally {
            setLoadingDigest(false);
        }
    };

    const triggerDigest = async () => {
        if (!hasItems) return;
        setIsGenerating(true);
        try {
            await api.get('/news/digest/trigger');
            // Poll for the digest to be ready
            let attempts = 0;
            const poll = async () => {
                if (attempts >= 60) { // Max 60 seconds
                    setIsGenerating(false);
                    return;
                }
                attempts++;
                try {
                    const res = await api.get('/news/digest');
                    if (res.data && res.data.id && res.data.answer_markdown) {
                        setDigest(res.data);
                        setIsGenerating(false);
                        return;
                    }
                } catch {
                    // Keep polling
                }
                setTimeout(poll, 1000);
            };
            setTimeout(poll, 2000); // Start polling after 2 seconds
        } catch {
            console.error("Failed to trigger digest");
            setIsGenerating(false);
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            // 1. Fetch Digest
            await fetchDigest();

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
        if (!ts) return 'Recently';
        try {
            // Robust parsing for numeric strings
            const val = typeof ts === 'string' && !isNaN(parseFloat(ts)) ? parseFloat(ts) : ts;

            let date: Date;
            if (typeof val === 'number') {
                // Finnhub returns seconds, but check if it's ms (huge number)
                date = new Date(val > 10000000000 ? val : val * 1000);
            } else {
                date = new Date(val);
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
                                    <ModelBadge key={model} model={model} />
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
                    {loadingDigest || isGenerating ? (
                        <div className="space-y-6 animate-pulse">
                            {/* Generating Header */}
                            <div className="flex items-center gap-3 mb-6">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                                        <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                        <Loader2 className="w-3 h-3 text-primary-foreground animate-spin" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-sm font-medium">Generating Your Digest</div>
                                    <div className="text-xs text-muted-foreground">Analyzing your watchlist and market news...</div>
                                </div>
                            </div>

                            {/* Skeleton Content */}
                            <div className="space-y-4">
                                <div className="h-6 bg-muted/50 rounded w-3/4" />
                                <div className="h-4 bg-muted/30 rounded w-full" />
                                <div className="h-4 bg-muted/30 rounded w-5/6" />
                                <div className="h-4 bg-muted/30 rounded w-4/5" />
                                <div className="h-4 bg-muted/30 rounded w-2/3" />
                            </div>

                            <div className="space-y-4 pt-4">
                                <div className="h-5 bg-muted/40 rounded w-1/2" />
                                <div className="h-4 bg-muted/30 rounded w-full" />
                                <div className="h-4 bg-muted/30 rounded w-5/6" />
                                <div className="h-4 bg-muted/30 rounded w-3/4" />
                            </div>

                            <div className="text-xs text-muted-foreground text-center pt-8">
                                This usually takes 20-40 seconds...
                            </div>
                        </div>
                    ) : digest ? (
                        <div className="space-y-4">
                            {/* RELATED TICKERS MINI-CARDS (TOP) */}
                            {digest.relatedTickers && digest.relatedTickers.length > 0 && (
                                <div className="mb-6 pb-4 border-b border-border/50">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                                        {digest.relatedTickers.map((t: { id: string; symbol: string; name: string; latestPrice?: { close: number; changePercent?: number; change?: number }; riskAnalysis?: { overall_score: number; financial_risk?: number } }) => (
                                            <MiniTickerTile
                                                key={t.id}
                                                symbol={t.symbol}
                                                company={t.name}
                                                price={Number(t.latestPrice?.close || 0)}
                                                change={Number(t.latestPrice?.changePercent || 0)}
                                                changeAmount={Number(t.latestPrice?.change || 0)}
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
                                    {(() => {
                                        const raw = digest.answer_markdown || "No content available.";
                                        // Cleanup JSON blocks and legacy markers
                                        return raw
                                            .replace(/```json[\s\S]*?```/g, '')
                                            .replace(/\[JSON Section\].*$/is, '')
                                            .trim();
                                    })()}
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
                        <div className="space-y-6 py-4">
                            {/* Onboarding Message */}
                            <div className="text-center space-y-3">
                                <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                                    <Sparkles className="w-8 h-8 text-primary" />
                                </div>
                                <h3 className="text-lg font-semibold">Your AI Digest is Waiting</h3>
                                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                                    Get personalized market insights based on your watchlist and portfolio.
                                    Follow these steps to get started:
                                </p>
                            </div>

                            {/* Tutorial Steps */}
                            <div className="space-y-3 max-w-md mx-auto">
                                <a
                                    href="/analyzer"
                                    className="flex items-start gap-4 p-4 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        1
                                    </div>
                                    <div className="space-y-1">
                                        <div className="font-medium group-hover:text-primary transition-colors">Browse Tickers</div>
                                        <p className="text-xs text-muted-foreground">
                                            Explore our library of {tickerCount ? `${tickerCount}+` : '30+'} analyzed stocks in the Analyzer
                                        </p>
                                    </div>
                                </a>

                                <a
                                    href="/watchlist"
                                    className="flex items-start gap-4 p-4 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        2
                                    </div>
                                    <div className="space-y-1">
                                        <div className="font-medium group-hover:text-primary transition-colors">Add to Watchlist</div>
                                        <p className="text-xs text-muted-foreground">
                                            Click the ⭐ star on any ticker to track it
                                        </p>
                                    </div>
                                </a>

                                <a
                                    href="/portfolio"
                                    className="flex items-start gap-4 p-4 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold text-sm shrink-0">
                                        3
                                    </div>
                                    <div className="space-y-1">
                                        <div className="font-medium group-hover:text-primary transition-colors">Build Your Portfolio</div>
                                        <p className="text-xs text-muted-foreground">
                                            Add positions to track your investments and P&L
                                        </p>
                                    </div>
                                </a>
                            </div>

                            {/* Generate Button or Disabled State */}
                            <div className="pt-6 text-center">
                                {portfolioCount > 0 ? (
                                    <div className="space-y-3">
                                        <button
                                            onClick={triggerDigest}
                                            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 text-white font-semibold hover:opacity-90 transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
                                        >
                                            <Sparkles size={18} />
                                            Generate Your Digest
                                        </button>
                                        <p className="text-xs text-muted-foreground">
                                            Analyzing {watchlistItemCount + portfolioCount} tracked items
                                            {watchlistItemCount > 0 && portfolioCount > 0 && (
                                                <span className="text-muted-foreground/60"> ({watchlistItemCount} watchlist + {portfolioCount} portfolio)</span>
                                            )}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Add stocks to your watchlist or portfolio above, then come back to generate your personalized AI digest.
                                    </p>
                                )}
                            </div>
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
                                                        {formatDate(item.datetime).replace(/,/g, ' ·')}
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
