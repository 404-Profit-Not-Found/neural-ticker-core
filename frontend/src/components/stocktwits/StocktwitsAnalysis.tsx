import { useEffect, useState } from 'react';
import { 
  MessageSquare, 
  RefreshCw,
  TrendingUp,
  History,
  Calendar,
  Activity,
  Bot,
  Trash2
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
import { analysisStore } from '../../store/analysisStore';

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
    analysisStore.start();
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
      analysisStore.stop();
      // Refresh history & watchers after new analysis
      axios.get<Analysis[]>(`/api/v1/stocktwits/${symbol}/history`).then(res => setHistory(res.data));
    }
  }, [symbol, isLocked]);
  
  const deleteAnalysis = async (id: string) => {
    if (!confirm('Are you sure you want to delete this analysis? This cannot be undone.')) return;
    try {
        await axios.delete(`/api/v1/stocktwits/analysis/${id}`);
        // Refresh history
        const { data } = await axios.get<Analysis[]>(`/api/v1/stocktwits/${symbol}/history`);
        setHistory(data);
        if (data.length > 0) {
            setAnalysis(data[0]);
        } else {
            setAnalysis(null);
        }
    } catch (e) {
        console.error('Delete failed', e);
        alert('Failed to delete analysis');
    }
  };

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
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
        
        {/* --- Header & Controls --- */}
        <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-xl border border-blue-500/20 shadow-sm">
                        <MessageSquare className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold tracking-tight leading-none">StockTwits Pulse</h3>
                        <p className="text-xs text-muted-foreground font-medium mt-1">AI Social Sentiment Analysis</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto">
                     {!isAdmin && (
                        <span className={`text-[10px] font-bold hidden md:inline-flex items-center gap-1 ${isLocked ? 'text-red-400' : 'text-primary/70'} mr-2`}>
                            {isLocked ? 'Insufficient Credits' : 'Credits Apply'}
                        </span>
                    )}
                    <RunAnalysisDialog 
                        onTrigger={(options) => triggerAnalysis({ model: options.modelKey, quality: options.quality })}
                        isAnalyzing={syncing}
                        defaultTicker={symbol}
                        trigger={
                            <Button 
                                disabled={syncing || isLocked}
                                size="sm"
                                className={`gap-2 h-9 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-md shadow-purple-500/20 border-0 transition-all duration-300 ${isLocked ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                            >
                                {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                                <span className="font-semibold">{syncing ? 'Analyzing...' : 'New Analysis'}</span>
                            </Button>
                        }
                    />
                </div>
            </div>

            {/* --- Control Bar (History & Meta) --- */}
            {analysis && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 border border-border/40 rounded-lg">
                    {/* History Select */}
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <History className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <select 
                            className="bg-transparent border-none text-xs font-semibold text-foreground focus:ring-0 cursor-pointer hover:text-primary transition-colors py-0 pl-0 pr-8 w-full truncate"
                            value={analysis?.id || ''}
                            onChange={(e) => {
                                const selected = history.find(h => h.id === e.target.value);
                                if (selected) setAnalysis(selected);
                            }}
                        >
                            {history.length > 0 ? history.map(h => (
                                <option key={h.id} value={h.id} className="bg-background text-foreground">
                                    {new Date(h.created_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} • {h.id === history[0].id ? 'Latest' : ''}
                                </option>
                            )) : (
                                <option value="">{new Date(analysis.created_at).toLocaleDateString()}</option>
                            )}
                        </select>
                    </div>

                    <div className="h-4 w-px bg-border/50 hidden md:block" />

                    {/* Meta Badges */}
                    <div className="flex items-center gap-3 text-[10px] md:text-xs text-muted-foreground font-medium overflow-x-auto no-scrollbar">
                         <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <Calendar className="w-3 h-3 text-orange-400" />
                            <span>{new Date(analysis.analysis_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(analysis.analysis_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </span>
                        
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <MessageSquare className="w-3 h-3 text-blue-400" />
                            <span>{analysis.posts_analyzed} posts</span>
                        </span>

                         <ModelBadge model={analysis.model_used} rarity="Common" className="h-5 text-[10px]" showIcon={false} />

                        {isAdmin && (
                             <button 
                                onClick={() => deleteAnalysis(analysis.id)}
                                className="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-colors"
                                title="Delete Analysis"
                             >
                                <Trash2 className="w-3.5 h-3.5" />
                             </button>
                        )}
                    </div>
                </div>
            )}
        </div>

      {!analysis ? (
        <div className="h-64 flex flex-col items-center justify-center p-8 bg-muted/5 rounded-2xl border border-dashed border-border text-center">
            <h4 className="text-lg font-semibold mb-2">No Intelligence Data</h4>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
                Start the AI engine to analyze social sentiment for {symbol}.
            </p>
            <Button disabled={syncing} onClick={() => triggerAnalysis({ model: 'gemini-1.5-flash', quality: 'medium' })}>
                Start Analysis
            </Button>
        </div>
      ) : (
        <>
            {/* --- Executive Summary (Top Priority) --- */}
            <Card className="bg-gradient-to-br from-background to-muted/20 border-primary/20 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-5">
                    <Activity className="w-24 h-24" />
                </div>
                <CardContent className="pt-5 pb-5 px-5 relative z-10">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5" /> Executive Summary
                    </h4>
                    <p className="text-sm md:text-base text-foreground/90 leading-relaxed font-medium">
                         {analysis.summary}
                    </p>
                    {analysis.highlights?.topics?.length > 0 && (
                         <div className="mt-4 flex flex-wrap gap-2">
                             {analysis.highlights.topics.slice(0, 5).map(topic => (
                                 <span key={topic} className="px-2 py-0.5 bg-background/80 border border-border rounded text-[10px] font-medium text-muted-foreground uppercase hover:border-primary/50 transition-colors">
                                     #{topic}
                                 </span>
                             ))}
                         </div>
                     )}
                </CardContent>
            </Card>

            {/* --- Core Metrics Grid --- */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                
                {/* 1. Sentiment Gauge (Compact) */}
                <Card className="md:col-span-4 bg-transparent border-border/50 shadow-sm">
                    <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[160px]">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 self-start w-full text-center md:text-left">Sentiment Score</h4>
                        <div className="scale-90 origin-center -mt-2">
                            <SentimentGauge score={analysis.sentiment_score} label={analysis.sentiment_label} />
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Volume Trend (Compact) */}
                <Card className="md:col-span-4 bg-transparent border-border/50 shadow-sm">
                     <CardContent className="p-4 flex flex-col h-full min-h-[160px]">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Volume Trend (30D)</h4>
                        <div className="flex-1 w-full min-h-0">
                             <VolumeSparkline 
                                data={volumeStats} 
                                startDate={volumeRange?.start}
                                endDate={volumeRange?.end}
                             />
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Bullish Drivers (List) */}
                <Card className="md:col-span-4 bg-transparent border-border/50 shadow-sm">
                     <CardContent className="p-4 h-full min-h-[160px]">
                        <div className="flex items-center gap-2 mb-3">
                             <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                             <h4 className="text-[10px] font-bold uppercase tracking-widest text-green-500">Key Drivers</h4>
                        </div>
                        
                        {analysis.highlights?.bullish_points?.length > 0 ? (
                            <ul className="space-y-2.5">
                                {analysis.highlights.bullish_points.slice(0, 3).map((pt, i) => (
                                    <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                                        <div className="mt-1.5 w-1 h-1 rounded-full bg-green-500 shrink-0" />
                                        <span className="line-clamp-2">{pt}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="text-xs text-muted-foreground italic">No strong drivers detected.</div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* --- Catalysts --- */}
            <div className="mt-2">
                <EventCalendar symbol={symbol} />
            </div>

            <div className="h-4" />
        </>
      )}
    </div>
  );
};
