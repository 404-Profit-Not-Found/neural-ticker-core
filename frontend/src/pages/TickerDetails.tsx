import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import ReactMarkdown from 'react-markdown';
// Tabs replaced by manual buttons for now
import {
    ArrowLeft,
    Star,
    TrendingUp,
    Newspaper,
    MessageSquare,
    Brain,
    ShieldAlert,
    Loader2
} from 'lucide-react';
import { TickerLogo } from '../components/dashboard/WatchlistTable'; // Reuse logo

export default function TickerDetails() {
    const { symbol } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [tickerData, setTickerData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState("overview");

    // State for tabs
    const [researchNote, setResearchNote] = useState<any>(null);
    const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
    const [riskAnalysis, setRiskAnalysis] = useState<any>(null);
    const [news, setNews] = useState<any[]>([]);
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState("");
    const [researchLoading, setResearchLoading] = useState(false);

    useEffect(() => {
        const fetchTickerData = async () => {
            if (!symbol) return;
            setLoading(true);
            try {
                // Parallel fetch: Snapshot, Watcher Count
                const [snapshotRes, watchersRes] = await Promise.all([
                    api.get(`/tickers/${symbol}/snapshot`),
                    api.get(`/social/stats/${symbol}/watchers`).catch(() => ({ data: { watchers: 0 } }))
                ]);

                setTickerData({
                    ...snapshotRes.data,
                    watchers: watchersRes.data.watchers
                });
            } catch (error) {
                console.error("Failed to load ticker details", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTickerData();
    }, [symbol]);

    // Fetch Tab Data on Switch
    useEffect(() => {
        if (!symbol) return;
        const loadTabData = async () => {
            if (activeTab === 'research') {
                // Check if we have an active polling ticket, if so don't fetch list
                if (activeTicketId) return;

                try {
                    const res = await api.get('/research');
                    // Simple heuristic: Find latest completed ticket for this ticker
                    // Ideally backend supports filtering by ticker.
                    // Client side filtering for now:
                    const relevant = res.data?.data?.find((t: any) => t.tickers.includes(symbol) && t.status === 'completed');
                    if (relevant) {
                        setResearchNote(relevant);
                    }
                } catch (e) { console.error(e); }
            }
            if (activeTab === 'risk') {
                try {
                    const res = await api.get(`/tickers/${symbol}/risk-reward`);
                    setRiskAnalysis(res.data);
                } catch (e) { console.error(e); }
            }
            if (activeTab === 'news') {
                try {
                    const res = await api.get(`/tickers/${symbol}/news`);
                    setNews(res.data || []);
                } catch (e) { console.error(e); }
            }
            if (activeTab === 'social') {
                try {
                    const res = await api.get(`/social/comments/${symbol}`);
                    setComments(res.data || []);
                } catch (e) { console.error(e); }
            }
        };
        loadTabData();
    }, [activeTab, symbol, activeTicketId]);

    // Polling Effect
    useEffect(() => {
        if (!activeTicketId) return;

        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/research/${activeTicketId}`);
                const ticket = res.data;
                console.log("Polling ticket:", ticket.status);

                if (ticket.status === 'completed') {
                    setResearchNote(ticket);
                    setResearchLoading(false);
                    setActiveTicketId(null); // Stop polling
                    clearInterval(interval);
                } else if (ticket.status === 'failed') {
                    setResearchLoading(false);
                    setActiveTicketId(null);
                    alert("Research failed.");
                    clearInterval(interval);
                }
                // If pending/processing, continue polling
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 3000); // Check every 3 seconds

        return () => clearInterval(interval);
    }, [activeTicketId]);

    const handleTriggerResearch = async () => {
        if (!symbol) return;
        setResearchLoading(true);
        setResearchNote(null); // Clear previous
        try {
            const res = await api.post('/research/ask', {
                tickers: [symbol],
                question: `Deep dive analysis into ${symbol}`,
                quality: 'deep' // User requested deep research
            });
            console.log("Research started, ticket:", res.data);
            setActiveTicketId(res.data.id); // Start polling
        } catch (e) {
            console.error(e);
            setResearchLoading(false);
            alert("Failed to start research");
        }
    };

    const handlePostComment = async () => {
        if (!newComment.trim() || !symbol) return;
        try {
            await api.post(`/social/comments/${symbol}`, { content: newComment });
            setNewComment("");
            // Refresh
            const res = await api.get(`/social/comments/${symbol}`);
            setComments(res.data || []);
        } catch (e) { console.error(e); }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#09090b] text-white">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!tickerData) {
        return <div className="p-8 text-white">Ticker not found.</div>;
    }

    const { ticker, latestPrice, fundamentals, watchers } = tickerData;
    const price = latestPrice?.close || 0;
    const change = latestPrice?.close && latestPrice?.prevClose
        ? ((latestPrice.close - latestPrice.prevClose) / latestPrice.prevClose) * 100
        : 0;

    return (
        <div className="min-h-screen bg-[#09090b] text-[#fafafa] p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-[#a1a1aa] hover:text-white">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <TickerLogo url={ticker.logo_url} symbol={ticker.symbol} />
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{ticker.symbol}</h1>
                            <p className="text-sm text-[#a1a1aa]">{ticker.name}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-2xl font-mono font-semibold">${Number(price || 0).toFixed(2)}</div>
                        <div className={`text-sm font-medium ${Number(change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {Number(change || 0) >= 0 ? '+' : ''}{Number(change || 0).toFixed(2)}%
                        </div>
                    </div>
                    <Badge variant="secondary" className="gap-1 px-3 py-1 text-sm bg-[#27272a] text-[#a1a1aa]">
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        {watchers} Watchers
                    </Badge>
                </div>
            </div>

            {/* Tabs Navigation (Placeholder for now, using buttons if Tabs component missing) */}
            <div className="border-b border-[#27272a]">
                <nav className="flex gap-6">
                    {[
                        { id: 'overview', label: 'Overview', icon: TrendingUp },
                        { id: 'research', label: 'AI Research', icon: Brain },
                        { id: 'risk', label: 'Risk Analysis', icon: ShieldAlert },
                        { id: 'news', label: 'News', icon: Newspaper },
                        { id: 'social', label: 'Social', icon: MessageSquare },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id
                                ? 'border-blue-500 text-blue-500'
                                : 'border-transparent text-[#a1a1aa] hover:text-[#fafafa]'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg bg-[#18181b] border border-[#27272a]">
                            <h3 className="text-sm font-medium text-[#a1a1aa] mb-4">Key Stats</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-[#a1a1aa]">Market Cap</span>
                                    <span>{fundamentals?.market_cap ? `$${(fundamentals.market_cap / 1000).toFixed(2)}B` : '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#a1a1aa]">P/E Ratio</span>
                                    <span>{fundamentals?.pe_ratio || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#a1a1aa]">Beta</span>
                                    <span>{fundamentals?.beta || '-'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'research' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-[#18181b] p-4 rounded-lg border border-[#27272a]">
                            <div>
                                <h3 className="font-semibold text-[#fafafa]">AI Deep Research</h3>
                                <p className="text-sm text-[#a1a1aa]">Generate a fresh, multi-agent analysis report.</p>
                            </div>
                            <Button onClick={handleTriggerResearch} disabled={researchLoading}>
                                {researchLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
                                {researchLoading ? "Researching..." : "Trigger Research"}
                            </Button>
                        </div>

                        {researchNote ? (
                            <div className="p-6 rounded-lg bg-[#18181b] border border-[#27272a] prose prose-invert max-w-none">
                                <ReactMarkdown>{researchNote.answer_markdown}</ReactMarkdown>
                                <div className="mt-4 text-xs text-[#a1a1aa] border-t border-[#27272a] pt-4">
                                    Research ID: {researchNote.id} • Model: {Array.isArray(researchNote.models_used) ? researchNote.models_used.join(', ') : 'Ensemble'} • {new Date(researchNote.created_at).toLocaleString()}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-[#a1a1aa] py-12">
                                {researchLoading ? "Deep research in progress. This may take a minute..." : "No research generated yet. Click 'Trigger Research' to start."}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'risk' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 rounded-lg bg-[#18181b] border border-[#27272a]">
                            <h3 className="text-lg font-semibold mb-4 text-[#fafafa]">Risk Score</h3>
                            {riskAnalysis ? (
                                <div className="text-4xl font-bold font-mono text-blue-500">
                                    {riskAnalysis.overall_score || "N/A"}
                                    <span className="text-sm text-[#a1a1aa] ml-2">/ 10</span>
                                </div>
                            ) : (
                                <div className="text-[#a1a1aa]">No risk analysis found. Trigger research to generate.</div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'news' && (
                    <div className="space-y-4">
                        {news.length > 0 ? news.map((item, idx) => (
                            <div key={idx} className="p-4 rounded-lg bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] transition-colors">
                                <a href={item.url} target="_blank" rel="noreferrer" className="block">
                                    <h4 className="font-medium text-blue-400 hover:underline mb-1">{item.headline}</h4>
                                    <div className="flex justify-between text-xs text-[#a1a1aa]">
                                        <span>{item.source}</span>
                                        <span>{new Date(item.datetime * 1000).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-sm text-[#d4d4d8] mt-2 line-clamp-2">{item.summary}</p>
                                </a>
                            </div>
                        )) : (
                            <div className="text-center text-[#a1a1aa] py-12">No recent news found.</div>
                        )}
                    </div>
                )}

                {activeTab === 'social' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Comment Input */}
                        <div className="flex gap-2">
                            <input
                                className="flex-1 bg-[#18181b] border border-[#27272a] rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                placeholder="Add a comment..."
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                            />
                            <Button onClick={handlePostComment} size="sm"><MessageSquare className="w-4 h-4 mr-2" /> Post</Button>
                        </div>

                        {/* Comments List */}
                        <div className="space-y-4">
                            {comments.map((comment) => (
                                <div key={comment.id} className="p-4 rounded-lg bg-[#18181b] border border-[#27272a]">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="font-semibold text-sm text-blue-400">{comment.user?.email || "User"}</div>
                                        <div className="text-xs text-[#a1a1aa]">{new Date(comment.created_at).toLocaleString()}</div>
                                    </div>
                                    <p className="text-sm text-[#eeeeee]">{comment.content}</p>
                                </div>
                            ))}
                            {comments.length === 0 && <div className="text-center text-[#a1a1aa] py-8">No comments yet. Be the first!</div>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
