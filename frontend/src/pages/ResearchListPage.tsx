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
      const params: Record<string, any> = { limit: 50 };
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

      <main className="container mx-auto px-4 py-8 max-w-[80rem] space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-8 h-8 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight">AI Reports</h1>
            </div>
            <p className="text-muted-foreground">
              {isRecent
                ? 'Showing reports generated in the last 24 hours.'
                : 'Browse all AI-generated research and analysis.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={isRecent ? 'secondary' : 'outline'}
              onClick={() => navigate('/research?filter=recent')}
            >
              New (24h)
            </Button>
            <Button
              variant={!isRecent ? 'secondary' : 'outline'}
              onClick={() => navigate('/research')}
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
          <div className="grid gap-4">
            {data.data.map((note) => (
              <Card
                key={note.id}
                className="group hover:border-primary/50 transition-all cursor-pointer bg-card/50 hover:bg-card"
                onClick={() => navigate(`/research/${note.id}`)}
              >
                <CardContent className="p-4 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
                  {/* Status / Icon */}
                  <div className="shrink-0">
                    {note.status === 'completed' ? (
                      <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                        <CheckCircle2 size={20} />
                      </div>
                    ) : note.status === 'failed' ? (
                      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                        <AlertTriangle size={20} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {note.tickers.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="font-bold bg-background/50"
                        >
                          {t}
                        </Badge>
                      ))}
                      {note.rarity && (
                        <Badge
                          className={cn(
                            'text-[10px] px-1.5 py-0 h-4 border uppercase tracking-wider',
                            note.rarity === 'Legendary'
                              ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                              : note.rarity === 'Epic'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                : 'bg-muted text-muted-foreground border-border',
                          )}
                          variant="outline"
                        >
                          {note.rarity}
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                      {note.title || note.question || 'Untitled Research'}
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={12} />
                        <span>
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} />
                        <span>
                          {new Date(note.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <span className="capitalize px-1.5 py-0.5 rounded bg-muted/50">
                        {note.status}
                      </span>
                    </div>
                  </div>

                  {/* Arrow action */}
                  <div className="shrink-0 hidden md:block opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">
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
