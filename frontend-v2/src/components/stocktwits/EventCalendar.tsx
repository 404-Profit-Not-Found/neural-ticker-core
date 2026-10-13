import { useEffect, useState, useCallback } from 'react';
import { Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/panel';
import { Badge } from '../ui/badge';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';
import { formatDateShort, isoDateTime } from '../../lib/datetime';
import axios from 'axios';

interface Event {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
  confidence: number;
  impact_score: number;
  source: string;
}

export const EventCalendar = ({ symbol }: { symbol: string }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await axios.get<Event[]>(`/api/v1/stocktwits/${symbol}/events`);
      setEvents(data);
    } catch {
      console.warn('No events found');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // A two-line row on phones (when · what on the left, impact and confidence
  // on the right), aligned columns from `sm` up. Nothing is wider than the
  // panel, so no column can be clipped.
  const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_9rem_4.5rem_4.5rem] sm:gap-x-4';

  return (
    <Panel aria-label="Upcoming catalysts">
      <PanelHeader
        title="Upcoming catalysts"
        icon={<CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
        led={null}
        actions={!loading && events.length > 0 ? <span className="num text-xs text-muted-foreground">{events.length}</span> : undefined}
      />

      {loading ? (
        <div className="space-y-2 p-3.5" aria-busy="true" aria-label="Loading catalysts">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-5 w-5" />}
          title="No upcoming catalysts detected"
          description="Dated events mentioned in the conversation will be listed here."
          className="py-8"
        />
      ) : (
        <>
          <div className={cn(ROW, 'hidden pb-1 pt-2 sm:grid')} aria-hidden>
            <span className="label-micro">Date</span>
            <span className="label-micro">Event</span>
            <span className="label-micro">Type</span>
            <span className="label-micro text-right">Impact</span>
            <span className="label-micro text-right">Confidence</span>
          </div>
          <ul className="pb-1.5">
            {events.map((event) => {
              const isEarnings = event.event_type === 'earnings';
              const lowConfidence = event.confidence < 0.6;
              return (
                <li key={event.id} className={cn(ROW, 'min-h-[3.25rem] py-2')}>
                  <time
                    dateTime={isoDateTime(event.event_date)}
                    className="num col-start-1 row-start-2 text-xs text-muted-foreground sm:row-start-1 sm:text-[13px]"
                  >
                    {formatDateShort(event.event_date)}
                  </time>

                  <div className="col-start-1 row-start-1 min-w-0 text-sm font-medium leading-snug text-foreground sm:col-start-2">
                    {event.title}
                  </div>

                  <div className="col-start-2 row-start-2 justify-self-end sm:col-start-3 sm:row-start-1 sm:justify-self-start">
                    <Badge variant={isEarnings ? 'purple' : 'outline'} className={isEarnings ? undefined : 'text-muted-foreground'}>
                      {event.event_type?.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div className="num col-start-2 row-start-1 flex items-baseline justify-end gap-2.5 text-sm sm:contents">
                    <span className={cn('font-semibold sm:col-start-4 sm:row-start-1 sm:justify-self-end', event.impact_score > 7 ? 'text-down' : 'text-foreground')} title="Expected impact, 0–10">
                      <span className="sr-only">Impact </span>
                      {event.impact_score ? `${event.impact_score}/10` : '—'}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs sm:col-start-5 sm:row-start-1 sm:justify-self-end sm:text-sm',
                        event.confidence > 0.8 ? 'text-up' : 'text-muted-foreground',
                      )}
                    >
                      {lowConfidence && <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" aria-label="Low confidence" />}
                      <span className="sr-only">Confidence </span>
                      <span>{(event.confidence * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
};
