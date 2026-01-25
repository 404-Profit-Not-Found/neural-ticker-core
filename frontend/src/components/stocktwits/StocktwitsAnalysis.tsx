import { useEffect, useState, useCallback } from 'react';
import { 
  MessageSquare, 
  RefreshCw,
  Zap,
  Calendar,
  Activity,
  Bot,
  Trash2
} from 'lucide-react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { SentimentGauge } from './SentimentGauge';
import { VolumeSparkline } from './VolumeSparkline';
import { EventCalendar } from './EventCalendar';
import { ModelBadge } from '../ui/model-badge';
import { useAuth } from '../../context/AuthContext';
import { RunAnalysisDialog } from '../ticker/RunAnalysisDialog';
import { analysisStore } from '../../store/analysisStore';
import { HistorySelector } from './HistorySelector';

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
      const { data: vData } = await axios.get<VolumeResponse>(`/api/v1/stocktwits/${symbol}/stats/volume`);
      setVolumeStats(vData.stats);
      setVolumeRange({ start: vData.startDate, end: vData.endDate });
    } catch (e) {
      console.error('Analysis failed', e);
    } finally {
      setSyncing(false);
      analysisStore.stop();
      axios.get<Analysis[]>(`/api/v1/stocktwits/${symbol}/history`).then(res => setHistory(res.data));
    }
  }, [symbol, isLocked]);
  
  const deleteAnalysis = async (id: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) return;
    try {
        await axios.delete(`/api/v1/stocktwits/analysis/${id}`);
        const { data } = await axios.get<Analysis[]>(`/api/v1/stocktwits/${symbol}/history`);
        setHistory(data);
        setAnalysis(data.length > 0 ? data[0] : null);
    } catch (e) {
        console.error('Delete failed', e);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const [analysisRes, statsRes, historyRes] = await Promise.all([
        axios.get<Analysis>(`/api/v1/stocktwits/${symbol}/analysis`).catch(() => ({ data: null })),
        axios.get<VolumeResponse>(`/api/v1/stocktwits/${symbol}/stats/volume`).catch(() => ({ data: null })),
        axios.get<Analysis[]>(`/api/v1/stocktwits/${symbol}/history`).catch(() => ({ data: [] }))
      ]);

      if (analysisRes.data) setAnalysis(analysisRes.data);
      if (historyRes.data) setHistory(historyRes.data);
      if (statsRes.data) {
        setVolumeStats(statsRes.data.stats);
        setVolumeRange({ start: statsRes.data.startDate, end: statsRes.data.endDate });
      }
    } catch (e) {
      console.warn('Error fetching StockTwits data', e);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchData();
  }, [symbol, fetchData]);

  if (loading) return <div className="h-48 w-full bg-muted/10 animate-pulse rounded-xl" />;

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
        
        {/* --- Header & Controls --- */}
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                    <MessageSquare size={14} /> StockTwits Pulse
                </h3>

                <RunAnalysisDialog 
                    onTrigger={(options) => triggerAnalysis({ model: options.modelKey, quality: options.quality })}
                    isAnalyzing={syncing}
                    defaultTicker={symbol}
                    trigger={
                        <Button 
                            disabled={syncing || isLocked}
                            size="sm"
                            className={`gap-2 h-9 px-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-md shadow-purple-500/20 border-0 transition-all duration-300 ${isLocked ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                        >
                            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                            <span className="font-bold uppercase text-[10px] tracking-wider">{syncing ? 'Analyzing...' : 'Research'}</span>
                        </Button>
                    }
                />
            </div>

            {/* --- Control Bar (History & Meta) --- */}
            {analysis && (
                <div className="flex flex-wrap items-center justify-between gap-4 p-2 px-3 bg-muted/10 border border-border/40 rounded-xl">
                    <div className="flex items-center gap-2">
                        <HistorySelector 
                          history={history} 
                          currentId={analysis.id} 
                          onSelect={setAnalysis} 
                        />
                    </div>

                    {/* Meta Info */}
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60 font-bold uppercase tracking-[0.15em]">
                         <span className="flex items-center gap-2">
                            <Calendar size={12} />
                            <span>{new Date(analysis.analysis_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(analysis.analysis_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </span>
                        
                        <span className="flex items-center gap-2">
                            <MessageSquare size={12} />
                            <span>{analysis.posts_analyzed} POSTS</span>
                        </span>

                         <ModelBadge model={analysis.model_used} rarity="Common" className="h-[18px] text-[8px] px-2 rounded-sm border-border/30 shadow-none bg-muted/20" showIcon={false} />

                        {isAdmin && (
                             <button 
                                onClick={() => deleteAnalysis(analysis.id)}
                                className="p-1 hover:text-destructive opacity-40 hover:opacity-100 transition-all font-normal"
                             >
                                <Trash2 size={12} />
                             </button>
                        )}
                    </div>
                </div>
            )}
        </div>

      {!analysis ? (
        <div className="h-48 flex flex-col items-center justify-center p-8 bg-muted/5 rounded-2xl border border-dashed border-border text-center">
            <h4 className="text-lg font-semibold mb-2 text-foreground">No Intelligence Data</h4>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">No analysis has been performed for this symbol recently. Start the AI engine to get insights.</p>
            <Button disabled={syncing} onClick={() => triggerAnalysis({ model: 'gemini-1.5-flash', quality: 'medium' })}>
                Start Analysis
            </Button>
        </div>
      ) : (
        <>
            {/* --- Executive Summary --- */}
            <section className="space-y-2">
                 <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                    <Activity size={14} /> Executive Summary
                </h3>
                <div className="bg-muted/10 border border-border/40 rounded-xl p-4">
                    <p className="text-[15px] text-foreground/80 leading-relaxed">
                         {analysis.summary}
                    </p>
                    {analysis.highlights?.topics?.length > 0 && (
                         <div className="mt-4 flex flex-wrap gap-2">
                             {analysis.highlights.topics.slice(0, 6).map(topic => (
                                 <span key={topic} className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest leading-none">
                                     #{topic}
                                 </span>
                             ))}
                         </div>
                     )}
                </div>
            </section>

            {/* --- Core Metrics Grid --- */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                
                {/* 1. Sentiment Score */}
                <Card className="md:col-span-4 bg-muted/5 border-border/40 shadow-none flex flex-col">
                    <CardHeader className="pb-1 pt-3 px-4">
                         <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sentiment</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0 flex-1 flex items-center justify-center min-h-[140px]">
                        <div className="scale-[0.85] origin-center -mt-2">
                            <SentimentGauge score={analysis.sentiment_score} label={analysis.sentiment_label} />
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Volume Trend */}
                <Card className="md:col-span-4 bg-muted/5 border-border/40 shadow-none flex flex-col">
                    <CardHeader className="pb-1 pt-3 px-4">
                         <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Volume (30D)</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0 flex-1 flex items-center justify-center min-h-[140px]">
                        <div className="h-[90px] w-full">
                             <VolumeSparkline 
                                data={volumeStats} 
                                startDate={volumeRange?.start}
                                endDate={volumeRange?.end}
                             />
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Market Highlights */}
                <Card className="md:col-span-4 bg-muted/5 border-border/40 shadow-none flex flex-col">
                     <CardHeader className="pb-1 pt-3 px-4">
                         <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <Zap size={12} /> Highlights
                         </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col justify-center min-h-[140px]">
                        <div className="space-y-3 py-1">
                             {/* Bullish Signals */}
                             {analysis.highlights?.bullish_points?.slice(0, 2).map((pt, i) => (
                                 <div key={`bull-${i}`} className="text-[13px] text-foreground/80 flex items-start gap-2.5 leading-relaxed">
                                     <div className="w-1 h-1 rounded-full bg-emerald-500 shrink-0 mt-2" />
                                     <span className="line-clamp-2">{pt}</span>
                                 </div>
                             ))}
                             
                             {/* Bearish Signals */}
                             {analysis.highlights?.bearish_points?.slice(0, 1).map((pt, i) => (
                                 <div key={`bear-${i}`} className="text-[13px] text-foreground/80 flex items-start gap-2.5 leading-relaxed">
                                     <div className="w-1 h-1 rounded-full bg-red-500 shrink-0 mt-2" />
                                     <span className="line-clamp-2 italic">{pt}</span>
                                 </div>
                             ))}

                             {!analysis.highlights?.bullish_points?.length && !analysis.highlights?.bearish_points?.length && (
                                 <div className="text-sm text-muted-foreground italic text-center">No key signals identified.</div>
                             )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* --- Catalysts --- */}
            <div className="mt-2">
                <EventCalendar symbol={symbol} />
            </div>
        </>
      )}
    </div>
  );
};
