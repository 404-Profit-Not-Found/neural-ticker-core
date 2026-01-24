import { useEffect, useState } from 'react';
import { 
  MessageSquare, 
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  Database
} from 'lucide-react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

interface VolumeStat {
  date: string;
  count: number;
}

export const StocktwitsAnalysis = ({ symbol }: { symbol: string }) => {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [volumeStats, setVolumeStats] = useState<VolumeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    try {
      // Parallel fetch for speed
      const [analysisRes, statsRes] = await Promise.all([
        axios.get(`/api/v1/stocktwits/${symbol}/analysis`).catch(() => ({ data: null })),
        axios.get(`/api/v1/stocktwits/${symbol}/stats/volume`).catch(() => ({ data: [] }))
      ]);

      if (analysisRes.data) {
        setAnalysis(analysisRes.data);
      } else {
        triggerAnalysis(); // Auto-trigger if missing
      }

      if (statsRes.data) {
        setVolumeStats(statsRes.data);
      }

    } catch (e) {
      console.warn('Error fetching StockTwits data', e);
    } finally {
      setLoading(false);
    }
  };

  const triggerAnalysis = async () => {
    setSyncing(true);
    try {
      const { data } = await axios.post(`/api/v1/stocktwits/${symbol}/analyze`);
      setAnalysis(data);
    } catch (e) {
      console.error('Analysis failed', e);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [symbol]);

  if (loading) return <div className="h-64 w-full bg-muted/20 animate-pulse rounded-xl" />;

  // Helper for Sentiment Gauge Color
  const getSentimentColor = (score: number) => {
      if (score >= 0.7) return 'text-green-500';
      if (score >= 0.4) return 'text-yellow-500';
      return 'text-red-500';
  };

  // Helper for Sentiment Gradient Bar
  const SentimentBar = ({ score }: { score: number }) => (
    <div className="w-full h-3 bg-secondary rounded-full overflow-hidden relative">
      <div 
        className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 opacity-30 w-full" 
      />
      <div 
        className="absolute top-0 bottom-0 w-2 bg-white ring-2 ring-black transform -translate-x-1/2 transition-all duration-1000"
        style={{ left: `${score * 100}%` }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-end border-b pb-4">
            <div>
                <h3 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <MessageSquare className="w-6 h-6 text-primary" /> StockTwits AI Pulse
                </h3>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" /> 
                        Last Sync: {analysis ? new Date(analysis.created_at).toLocaleString() : 'Never'}
                    </span>
                    {analysis && (
                        <span className="flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            Data Window: {new Date(analysis.analysis_start).toLocaleDateString()} - {new Date(analysis.analysis_end).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </div>
            <Button 
            variant="outline" 
            size="sm" 
            onClick={triggerAnalysis} 
            disabled={syncing}
            className="h-9 gap-2"
            >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Analyzing...' : 'Refresh Intelligence'}
            </Button>
        </div>

      {!analysis ? (
        <div className="h-48 flex items-center justify-center p-6 bg-muted/10 rounded-xl border border-dashed border-muted-foreground/30 text-center text-muted-foreground">
          No intelligence data available. Click refresh to trigger analysis.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Sentiment & Metrics */}
            <Card className="col-span-1 border-border/60 shadow-sm bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6 flex flex-col items-center justify-center h-full gap-6">
                    <div className="text-center w-full">
                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Market Sentiment</span>
                        <div className={`text-5xl font-black mt-2 tracking-tighter ${getSentimentColor(analysis.sentiment_score)}`}>
                            {(analysis.sentiment_score * 100).toFixed(0)}%
                        </div>
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold mt-2 border ${
                            analysis.sentiment_score >= 0.6 ? 'bg-green-500/10 border-green-500/20 text-green-500' : 
                            analysis.sentiment_score >= 0.4 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : 
                            'bg-red-500/10 border-red-500/20 text-red-500'
                        }`}>
                            {analysis.sentiment_label.toUpperCase()}
                        </div>
                    </div>
                    
                    <SentimentBar score={analysis.sentiment_score} />

                    <div className="w-full grid grid-cols-2 gap-4 text-center mt-2">
                        <div className="p-3 rounded-lg bg-muted/30">
                            <span className="block text-[10px] text-muted-foreground uppercase">Posts Analyzed</span>
                            <span className="block text-lg font-bold">{analysis.posts_analyzed}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                            <span className="block text-[10px] text-muted-foreground uppercase">AI Tokens</span>
                            <span className="block text-lg font-bold">{analysis.tokens_used?.toLocaleString() || '-'}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Middle: Volume Chart */}
            <Card className="col-span-1 lg:col-span-2 border-border/60 shadow-sm bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6 h-full">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Message Volume Trend (30 Days)</span>
                        <span className="text-[10px] bg-secondary px-2 py-1 rounded text-secondary-foreground">Messages per Day</span>
                    </div>
                    <div className="h-[200px] w-full">
                        {volumeStats.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={volumeStats}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                    <XAxis 
                                        dataKey="date" 
                                        tick={{fontSize: 10, fill: '#666'}} 
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}
                                    />
                                    <YAxis hide />
                                    <Tooltip 
                                        contentStyle={{backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', fontSize: '12px'}}
                                        cursor={{fill: '#ffffff10'}}
                                    />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                Not enough data for volume chart yet.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Bottom Row: Insights */}
            <div className="col-span-1 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Summary */}
                <Card className="border-border/60 p-6 bg-card/30">
                     <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-500" /> Executive Summary
                     </h4>
                     <p className="text-sm leading-relaxed text-muted-foreground">
                        {analysis.summary}
                     </p>
                     <div className="mt-4 flex flex-wrap gap-2">
                        {analysis.highlights?.topics?.map(topic => (
                             <span key={topic} className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs rounded-md font-medium">
                                #{topic}
                            </span>
                        ))}
                     </div>
                </Card>

                {/* Bull/Bear Points */}
                <div className="space-y-4">
                    {analysis.highlights?.bullish_points?.length > 0 && (
                        <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10">
                            <h5 className="text-xs font-bold text-green-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <TrendingUp className="w-3.5 h-3.5" /> Bullish Drivers
                            </h5>
                            <ul className="space-y-2">
                                {analysis.highlights.bullish_points.map((pt, i) => (
                                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                        <div className="mt-1.5 w-1 h-1 rounded-full bg-green-500 shrink-0" />
                                        {pt}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {analysis.highlights?.bearish_points?.length > 0 && (
                        <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                             <h5 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <TrendingDown className="w-3.5 h-3.5" /> Bearish Risks
                            </h5>
                            <ul className="space-y-2">
                                {analysis.highlights.bearish_points.map((pt, i) => (
                                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                        <div className="mt-1.5 w-1 h-1 rounded-full bg-red-500 shrink-0" />
                                        {pt}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="col-span-full text-[10px] text-center text-muted-foreground/40 uppercase tracking-widest mt-4">
                Powered by {analysis.model_used} • {analysis.id}
            </div>
        </div>
      )}
    </div>
  );
};
