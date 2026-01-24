import { useEffect, useState, useCallback } from 'react';
import { Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';

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
    } catch (e) {
      console.warn('No events found');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  if (loading) return <div className="h-24 w-full bg-muted/10 animate-pulse rounded-lg mt-6" />;
  if (events.length === 0) {
      return (
          <div className="text-center p-6 text-muted-foreground/50 text-sm border border-dashed border-border/50 rounded-xl mt-6">
              <CalendarIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
              No upcoming catalysts detected in conversation.
          </div>
      );
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground ml-1">
        <CalendarIcon className="w-4 h-4 text-primary" /> Upcoming Catalysts ({events.length})
      </h3>
      
      <div className="overflow-hidden rounded-xl bg-transparent border border-border/40">
        <table className="w-full text-sm">
          <thead className="bg-muted/10 text-[10px] uppercase text-muted-foreground font-semibold">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Event</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-center">Impact</th>
              <th className="px-4 py-2 text-right">Conf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-foreground/80">
                  {format(new Date(event.event_date), 'MMM d')}
                </td>
                <td className="px-4 py-3 text-foreground font-medium">
                  {event.title}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide
                    ${event.event_type === 'earnings' 
                      ? 'bg-purple-500/10 text-purple-400' 
                      : 'bg-secondary/50 text-secondary-foreground'
                    }`}>
                    {event.event_type?.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {event.impact_score ? (
                    <span className={`font-bold text-xs ${event.impact_score > 7 ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {event.impact_score}
                    </span>
                  ) : <span className="text-muted-foreground/30">-</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {event.confidence < 0.6 && <AlertTriangle className="w-3 h-3 text-yellow-500/80" />}
                    <span className={`text-xs font-mono ${
                      event.confidence > 0.8 ? 'text-emerald-400' : 
                      event.confidence < 0.5 ? 'text-yellow-400' : 'text-muted-foreground'
                    }`}>
                      {(event.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
