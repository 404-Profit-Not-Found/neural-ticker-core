import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  FileText,
  Clock,
  Calendar,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Newspaper,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { ModelBadge } from '../components/ui/model-badge';
import type { ResearchItem } from '../types/ticker';

export function ResearchListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filter = searchParams.get('filter'); // 'recent' or null
  const isRecent = filter === 'recent';
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  // Delete mutation for admin
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/research/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-list'] });
    },
  });

  const { data, isLoading, isError } = useQuery<{
    data: ResearchItem[];
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
                onClick={() => navigate(`/ticker/${note.tickers[0] || 'unknown'}/research/${note.id}`)}
              >
                <CardContent className="p-4 flex flex-row items-start md:items-center gap-3 md:gap-4">
                  {/* Icon Replacement: Ticker Logo or News */}
                  <div className="shrink-0">
                    {note.status === 'processing' || note.status === 'pending' ? (
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                        <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />
                      </div>
                    ) : note.status === 'failed' ? (
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                        <AlertTriangle className="w-5 h-5 md:w-6 md:h-6" />
                      </div>
                    ) : (note.tickers.length > 1 || (note.title && note.title.toLowerCase().includes('news'))) ? (
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary-foreground">
                        <Newspaper className="w-5 h-5 md:w-6 md:h-6" />
                      </div>
                    ) : (
                      <TickerLogo
                        symbol={note.tickers[0]}
                        className="w-10 h-10 md:w-12 md:h-12 rounded-lg"
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5 md:mb-1">
                      {note.tickers.map((t: string) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="font-bold bg-muted/30 h-5 px-1.5 text-[10px] md:text-xs md:px-2"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="text-sm md:text-base font-bold line-clamp-2 md:truncate group-hover:text-primary transition-colors leading-tight mb-1">
                      {note.title || note.question || 'Untitled Research'}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] md:text-xs text-muted-foreground">
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

                      <span className="text-muted-foreground hidden md:inline">•</span>

                      {/* Author Section Replicating ResearchFeed */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-muted-foreground hidden md:inline">By</span>
                        <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                          {note.user?.avatar_url ? (
                            <img src={note.user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[8px] md:text-[9px] font-bold text-muted-foreground uppercase">
                              {(note.user?.nickname || note.user?.email || '?').charAt(0)}
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-foreground truncate max-w-[80px] md:max-w-[120px]">
                          {note.user?.nickname || note.user?.email?.split('@')[0] || 'AI'}
                        </span>
                      </div>

                      {/* Provider / Model */}
                      {note.status === 'completed' && note.provider && (
                        <>
                          <span className="text-muted-foreground hidden md:inline">•</span>
                          <ModelBadge
                            model={note.models_used && note.models_used.length > 0 ? note.models_used[0] : note.provider}
                            rarity={note.rarity}
                            className="h-4 md:h-5 text-[9px] md:text-[10px]"
                          />
                        </>
                      )}

                      {/* Token usage */}
                      {note.status === 'completed' && ((note.tokens_in ?? 0) + (note.tokens_out ?? 0)) > 0 && (
                        <>
                          <span className="text-muted-foreground hidden md:inline">•</span>
                          <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] whitespace-nowrap">
                            {((note.tokens_in ?? 0) + (note.tokens_out ?? 0)).toLocaleString()} tokens used
                          </span>
                        </>
                      )}

                      {note.status !== 'completed' && (
                        <span className="capitalize px-1.5 py-0.5 rounded bg-muted/50 border border-border/50">
                          {note.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Admin delete action */}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this research note?')) {
                          deleteMutation.mutate(note.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}

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
