import { useEffect, useState } from 'react';
import { 
  MessageSquare, 
  RefreshCw,
  TrendingUp,
  History,
  Clock,
  Calendar,
  Activity,
  Bot
} from 'lucide-react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { SentimentGauge } from './SentimentGauge';
import { VolumeSparkline } from './VolumeSparkline';
import { EventCalendar } from './EventCalendar';
import { ModelBadge } from '../ui/model-badge';
import { useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { RunAnalysisDialog } from '../ticker/RunAnalysisDialog';

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

interface VolumeResponse {
  symbol: string;
  startDate: string;
  endDate: string;
  stats: VolumeStat[];
}

export const StocktwitsAnalysis = ({ symbol }: { symbol: string }) => {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [volumeStats, setVolumeStats] = useState<VolumeStat[]>([]);
  const [volumeRange, setVolumeRange] = useState<{ start: string; end: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const REFRESH_COST = 2;
  const hasCredits = (user?.credits_balance ?? 0) >= REFRESH_COST;
  const isAdmin = user?.role === 'admin';
  const isLocked = !hasCredits && !isAdmin;

  const triggerAnalysis = useCallback(async (options: { model: string; quality: 'low' | 'medium' | 'high' | 'deep' }) => {
    if (isLocked) return;
    setSyncing(true);
    try {
      const { data } = await axios.post<Analysis>(`/api/v1/stocktwits/${symbol}/analyze`, {
        model: options.model,
        quality: options.quality
      });
      setAnalysis(data);
      // Refresh volume stats too just in case
      const { data: vData } = await axios.get<VolumeResponse>(`/api/v1/stocktwits/${symbol}/stats/volume`);
      setVolumeStats(vData.stats);
      setVolumeRange({ start: vData.startDate, end: vData.endDate });

    } catch (e) {
      console.error('Analysis failed', e);
    } finally {
      setSyncing(false);
      // Refresh history after new analysis
      axios.get<Analysis[]>(`/api/v1/stocktwits/${symbol}/history`).then(res => setHistory(res.data));
    }
  }, [symbol, isLocked]);

  const fetchData = useCallback(async () => {
    try {
      // Parallel fetch for speed
      const [analysisRes, statsRes, historyRes] = await Promise.all([
        axios.get<Analysis>(`/api/v1/stocktwits/${symbol}/analysis`).catch(() => ({ data: null })),
        axios.get<VolumeResponse>(`/api/v1/stocktwits/${symbol}/stats/volume`).catch(() => ({ data: null })),
        axios.get<Analysis[]>(`/api/v1/stocktwits/${symbol}/history`).catch(() => ({ data: [] }))
      ]);

      if (analysisRes.data) {
        setAnalysis(analysisRes.data);
      }

      if (historyRes.data) {
        setHistory(historyRes.data);
      }

      if (statsRes.data) {
        setVolumeStats(statsRes.data.stats);
        setVolumeRange({ start: statsRes.data.startDate, end: statsRes.data.endDate });
      }

    } catch (e) {
      console.warn('Error fetching StockTwits data', e);
    } finally {
      setLoading(false);
    }
  }, [symbol, triggerAnalysis]);

  useEffect(() => {
    fetchData();
  }, [symbol, fetchData]);

  if (loading) return <div className="h-64 w-full bg-muted/10 animate-pulse rounded-xl" />;

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        
        {/* --- Header --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-6">
            <div>
                <h3 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
                    <MessageSquare className="w-8 h-8 text-blue-500" /> 
                    <span>StockTwits AI Pulse</span>
                </h3>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-xs font-medium text-muted-foreground/80">
                    <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> 
                        <select 
                            className="bg-transparent border-none text-[10px] md:text-xs font-bold uppercase text-muted-foreground focus:ring-0 cursor-pointer hover:text-foreground transition-colors"
                            value={analysis?.id || ''}
                            onChange={(e) => {
                                const selected = history.find(h => h.id === e.target.value);
                                if (selected) setAnalysis(selected);
                            }}
                        >
                            {history.length > 0 ? history.map(h => (
                                <option key={h.id} value={h.id} className="bg-background text-foreground">
                                    {new Date(h.created_at).toLocaleString()} {h.id === history[0].id ? '(Latest)' : ''}
                                </option>
                            )) : (
                                <option value="">{analysis ? new Date(analysis.created_at).toLocaleString() : 'Never'}</option>
                            )}
                        </select>
                    </span>
                    {analysis && (
                        <>
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/30 border border-border/50">
                                <History className="w-3.5 h-3.5 text-orange-400" />
                                <span className="text-[10px] md:text-xs font-bold uppercase">Data Window:</span>
                                <span className="text-foreground font-mono text-[10px] md:text-xs">{new Date(analysis.analysis_start).toLocaleDateString()} - {new Date(analysis.analysis_end).toLocaleDateString()}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="text-muted-foreground uppercase text-[10px] font-bold">Posts:</span>
                                <span className="text-foreground font-mono text-[10px] md:text-xs">{analysis.posts_analyzed}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground uppercase text-[10px] font-bold">{analysis.tokens_used.toLocaleString()} tokens</span>
                            </span>
                            <ModelBadge model={analysis.model_used} rarity="Common" />
                        </>
                    )}
                </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
                <RunAnalysisDialog 
                    onTrigger={(options) => triggerAnalysis({ model: options.modelKey, quality: options.quality })}
                    isAnalyzing={syncing}
                    defaultTicker={symbol}
                    trigger={
                        <Button 
                            disabled={syncing || isLocked}
                            className={`gap-2 px-6 text-sm h-9 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-purple-500/25 border-0 transition-all duration-300 hover:scale-[1.02] ${isLocked ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                        >
                            {syncing ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <Bot className="w-4 h-4" />
                            )}
                            <span className="font-semibold">{syncing ? 'Analyzing...' : 'AI Analyze'}</span>
                        </Button>
                    }
                />
                {!isAdmin && (
                    <span className={`text-[10px] font-bold flex items-center gap-1 ${isLocked ? 'text-red-400' : 'text-primary/70'}`}>
                        Premium Models Cost Credits
                    </span>
                )}
            </div>
        </div>

      {!analysis ? (
        <div className="h-64 flex flex-col items-center justify-center p-8 bg-muted/5 rounded-2xl border border-dashed border-border text-center">
            <h4 className="text-lg font-semibold mb-2">No Intelligence Data Found</h4>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
                We haven't analyzed the social sentiment for {symbol} yet. Click the button above to start the AI research engine.
            </p>
            <RunAnalysisDialog 
                onTrigger={(options) => triggerAnalysis({ model: options.modelKey, quality: options.quality })}
                isAnalyzing={syncing}
                defaultTicker={symbol}
                trigger={
                    <Button disabled={syncing}>
                        {syncing ? 'Analyzing...' : 'Start Analysis'}
                    </Button>
                }
            />
        </div>
      ) : (
        <>
            {/* --- Data Grid --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Market Sentiment Gauge */}
                <Card className="bg-gradient-to-br from-card to-card/50 border-border/50 shadow-sm relative overflow-hidden group hover:border-border/80 transition-colors">
                    <CardContent className="pt-6 relative z-10">
                        <div className="flex items-center justify-between mb-2">
                             <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">StockTwits Sentiment (30D)</h4>
                        </div>
                        <SentimentGauge score={analysis.sentiment_score} label={analysis.sentiment_label} />

                    </CardContent>
                </Card>

                {/* 2. Volume Trend */}
                <Card className="bg-gradient-to-br from-card to-card/50 border-border/50 shadow-sm relative mb-auto md:mb-0 h-full">
                     <CardContent className="pt-6 h-full flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                             <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Message Volume Trend</h4>
                        </div>
                        
                        <div className="flex-1 flex flex-col justify-center relative">
                             <VolumeSparkline 
                                data={volumeStats} 
                                startDate={volumeRange?.start}
                                endDate={volumeRange?.end}
                             />
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Bullish Drivers */}
                <Card className="bg-gradient-to-br from-card to-card/50 border-border/50 shadow-sm md:col-span-1 h-full">
                     <CardContent className="pt-6 h-full">
                        <div className="flex items-center justify-start gap-2 mb-4">
                             <TrendingUp className="w-4 h-4 text-green-500" />
                             <h4 className="text-xs font-bold uppercase tracking-widest text-green-500">Bullish Drivers</h4>
                        </div>
                        
                        {analysis.highlights?.bullish_points?.length > 0 ? (
                            <ul className="space-y-3">
                                {analysis.highlights.bullish_points.slice(0, 4).map((pt, i) => (
                                    <li key={i} className="text-sm text-foreground/90 flex items-start gap-3 group">
                                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500/50 group-hover:bg-green-400 shrink-0 transition-colors" />
                                        <span className="leading-snug">{pt}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="text-sm text-muted-foreground italic">No strong bullish signals detected.</div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* --- Executive Summary & Topics --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full items-stretch">
                <div className="md:col-span-2 flex flex-col gap-6">
                     <Card className="bg-secondary/5 border-primary/10 shadow-sm h-full">
                        <CardContent className="pt-6">
                             <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-primary">
                                <Activity className="w-4 h-4" /> Executive Summary
                             </h4>
                             <p className="text-base text-card-foreground/90 leading-relaxed">
                                 {analysis.summary}
                             </p>

                             {analysis.highlights?.topics?.length > 0 && (
                                 <div className="mt-6 flex flex-wrap gap-2">
                                     {analysis.highlights.topics.map(topic => (
                                         <span key={topic} className="px-3 py-1 bg-background border border-border rounded-md text-xs font-medium hover:border-primary/50 transition-colors cursor-default text-muted-foreground">
                                             #{topic}
                                         </span>
                                     ))}
                                 </div>
                             )}
                        </CardContent>
                    </Card>
                </div>
                
                {/* --- Events Integration --- */}
                <div className="md:col-span-1 h-full">
                    <EventCalendar symbol={symbol} />
                </div>
            </div>
            
             <div className="h-4" />

        </>
      )}
    </div>
  );
};
