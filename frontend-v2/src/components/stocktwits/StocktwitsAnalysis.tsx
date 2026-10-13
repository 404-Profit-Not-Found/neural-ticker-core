import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useConfirm } from '../ui/confirm';
import { Panel, PanelHeader, PanelBody } from '../ui/panel';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { SentimentGauge } from './SentimentGauge';
import { VolumeSparkline } from './VolumeSparkline';
import { EventCalendar } from './EventCalendar';
import { ModelBadge } from '../ui/model-badge';
import { useAuth } from '../../context/AuthContext';
import { RunAnalysisDialog } from '../ticker/RunAnalysisDialog';
import { AiButton } from '../ticker/AiButton';
import { analysisStore } from '../../store/analysisStore';
import { HistorySelector } from './HistorySelector';
import { formatCount } from '../../lib/format';
import { formatDateRange } from '../../lib/datetime';

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
  const confirm = useConfirm();
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
    const confirmed = await confirm({
        title: `Delete this ${symbol} analysis?`,
        description: 'This can’t be undone.',
        confirmLabel: 'Delete analysis',
        destructive: true,
    });
    if (!confirmed) return;
    try {
        await axios.delete(`/api/v1/stocktwits/analysis/${id}`);
        const { data } = await axios.get<Analysis[]>(`/api/v1/stocktwits/${symbol}/history`);
        setHistory(data);
        setAnalysis(data.length > 0 ? data[0] : null);
    } catch (e) {
        console.error('Delete failed', e);
        toast.error('Failed to delete analysis');
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

  if (loading) {
    return (
      <div className="flex flex-col gap-3 sm:gap-4" aria-busy="true" aria-label="Loading social analysis">
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    );
  }

  const runButton = (
    <RunAnalysisDialog
      onTrigger={(options) => triggerAnalysis({ model: options.modelKey, quality: options.quality })}
      isAnalyzing={syncing}
      defaultTicker={symbol}
      trigger={
        <AiButton disabled={syncing || isLocked} busy={syncing}>
          {syncing ? 'Analyzing…' : 'Analyze'}
        </AiButton>
      }
    />
  );

  const bullish = analysis?.highlights?.bullish_points?.slice(0, 3) ?? [];
  const bearish = analysis?.highlights?.bearish_points?.slice(0, 2) ?? [];
  const topics = analysis?.highlights?.topics?.slice(0, 6) ?? [];

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <Panel aria-label="StockTwits pulse">
        <PanelHeader
          title="StockTwits pulse"
          icon={<MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          led="ai"
          pulse={syncing}
          actions={runButton}
          className="max-lg:py-2"
        />

        {!analysis ? (
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" />}
            title="No social analysis yet"
            description={
              isLocked
                ? `Reading the StockTwits conversation costs ${REFRESH_COST} credits, and you have none left.`
                : `Run an analysis to summarise what retail investors are saying about ${symbol}.`
            }
          />
        ) : (
          <PanelBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <HistorySelector history={history} currentId={analysis.id} onSelect={setAnalysis} />
              {/* Each fact is one unbreakable unit, so the row wraps between
                  facts — never in the middle of "295 posts". */}
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="num whitespace-nowrap">{formatDateRange(analysis.analysis_start, analysis.analysis_end)}</span>
                <span className="num whitespace-nowrap">{formatCount(analysis.posts_analyzed)} posts</span>
                <ModelBadge model={analysis.model_used} showIcon={false} />
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => deleteAnalysis(analysis.id)}
                  aria-label="Delete this analysis"
                  className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </div>

            <p className="max-w-[80ch] text-sm leading-relaxed text-foreground/90 sm:text-[15px]">
              {analysis.summary}
            </p>

            {topics.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Topics discussed">
                {topics.map((topic) => (
                  <li key={topic} className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {topic}
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        )}
      </Panel>

      {analysis && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            <Panel aria-label="Sentiment">
              <PanelHeader title="Sentiment" led={null} />
              <PanelBody className="flex items-center justify-center py-4">
                <SentimentGauge score={analysis.sentiment_score} label={analysis.sentiment_label} />
              </PanelBody>
            </Panel>

            <Panel aria-label="Post volume, last 30 days">
              <PanelHeader title="Post volume · 30d" led={null} />
              <PanelBody>
                <VolumeSparkline data={volumeStats} startDate={volumeRange?.start} endDate={volumeRange?.end} />
              </PanelBody>
            </Panel>

            <Panel aria-label="Highlights">
              <PanelHeader title="Highlights" led={null} />
              <PanelBody>
                {bullish.length === 0 && bearish.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No key signals identified.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {bullish.map((point, i) => (
                      <li key={`bull-${i}`} className="flex items-start gap-2.5 text-sm leading-snug text-foreground/90">
                        <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 bg-up" />
                        <span className="min-w-0 break-words"><span className="sr-only">Bullish: </span>{point}</span>
                      </li>
                    ))}
                    {bearish.map((point, i) => (
                      <li key={`bear-${i}`} className="flex items-start gap-2.5 text-sm leading-snug text-foreground/90">
                        <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 bg-down" />
                        <span className="min-w-0 break-words"><span className="sr-only">Bearish: </span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelBody>
            </Panel>
          </div>

          <EventCalendar symbol={symbol} />
        </>
      )}
    </div>
  );
};
