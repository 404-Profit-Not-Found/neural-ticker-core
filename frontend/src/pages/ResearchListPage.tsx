import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  FileText,
  Clock,
  Calendar,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../lib/api';

// Reusing types from ResearchPage or defining subset
interface ResearchNoteSummary {
  id: string;
  tickers: string[];
  title?: string;
  question?: string;
  status: 'completed' | 'pending' | 'failed' | 'processing';
  created_at: string;
  rarity?: string;
}

export function ResearchListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filter = searchParams.get('filter'); // 'recent' or null
  const isRecent = filter === 'recent';

  const { data, isLoading, isError } = useQuery<{
    data: ResearchNoteSummary[];
    total: number;
  }>({
    queryKey: ['research-list', filter],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 50 };
      if (isRecent) {
        params.since = 24; // 24 hours
      }
      const res = await api.get('/research', { params });
      return res.data;
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <Header />

      <main className="container mx-auto px-4 py-6 md:py-8 max-w-[80rem] space-y-6 md:space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
              <FileText className="w-6 h-6 md:w-8 md:h-8 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">AI Reports</h1>
            </div>
            <p className="text-sm md:text-base text-muted-foreground">
              {isRecent
                ? 'Showing reports generated in the last 24 hours.'
                : 'Browse all AI-generated research and analysis.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full md:w-auto">
            <Button
              variant={isRecent ? 'secondary' : 'outline'}
              onClick={() => navigate('/research?filter=recent')}
              className="w-full"
            >
              New (24h)
            </Button>
            <Button
              variant={!isRecent ? 'secondary' : 'outline'}
              onClick={() => navigate('/research')}
              className="w-full"
            >
              All Reports
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground text-sm">Loading reports...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-destructive">
            <AlertTriangle className="w-8 h-8 mb-4" />
            <p className="font-semibold">Failed to load research reports.</p>
          </div>
        ) : data?.data && data.data.length > 0 ? (
          <div className="grid gap-3 md:gap-4">
            {data.data.map((note) => (
              <Card
                key={note.id}
                className="group hover:border-primary/50 transition-all cursor-pointer bg-card/50 hover:bg-card"
                onClick={() => navigate(`/research/${note.id}`)}
              >
                <CardContent className="p-4 flex flex-row items-start md:items-center gap-3 md:gap-4">
                  {/* Status / Icon */}
                  <div className="shrink-0 pt-0.5 md:pt-0">
                    {note.status === 'completed' ? (
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                        <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                    ) : note.status === 'failed' ? (
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                        <AlertTriangle className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                        <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1.5 md:space-y-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5 md:mb-1">
                      {note.tickers.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="font-bold bg-background/50 h-5 px-1.5 text-[10px] md:text-xs md:h-6 md:px-2.5"
                        >
                          {t}
                        </Badge>
                      ))}
                      {note.rarity && (
                        <Badge
                          className={cn(
                            'text-[10px] px-1.5 py-0 h-4 md:h-5 border uppercase tracking-wider',
                            note.rarity === 'Legendary'
                              ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                              : note.rarity === 'Epic'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                : note.rarity === 'Rare'
                                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                  : note.rarity === 'Uncommon'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : 'bg-muted text-muted-foreground border-border',
                          )}
                          variant="outline"
                        >
                          {note.rarity}
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-sm md:text-lg font-semibold line-clamp-2 md:truncate group-hover:text-primary transition-colors leading-tight">
                      {note.title || note.question || 'Untitled Research'}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] md:text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar size={10} className="md:w-3 md:h-3" />
                        <span>
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={10} className="md:w-3 md:h-3" />
                        <span>
                          {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="capitalize px-1.5 py-0.5 rounded bg-muted/50 border border-border/50">
                        {note.status}
                      </span>
                    </div>
                  </div>

                  {/* Arrow action */}
                  <div className="shrink-0 hidden md:block opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0 duration-300">
                    <ArrowRight className="text-primary w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground bg-muted/10 rounded-lg border border-dashed border-border">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted/20 mb-4">
              <FileText className="w-6 h-6 opacity-50" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No reports found</h3>
            <p className="text-sm max-w-sm mx-auto">
              {isRecent
                ? 'No research reports have been generated in the last 24 hours.'
                : 'Start a new analysis to see reports here.'}
            </p>
            {!isRecent && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate('/dashboard')} // Or trigger new research
              >
                Go to Dashboard
              </Button>
            )}
            {isRecent && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate('/research')} // Clear filter
              >
                View All Reports
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
