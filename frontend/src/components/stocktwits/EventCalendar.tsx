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
    } catch {
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
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground ml-1">
        <CalendarIcon size={14} className="text-muted-foreground" /> Upcoming Catalysts ({events.length})
      </h3>
      
      <div className="overflow-hidden rounded-xl bg-muted/10 border border-border/40 shadow-none">
        <table className="w-full text-sm">
          <thead className="bg-muted/10 border-b border-border/40">
            <tr>
              <th className="px-5 py-2.5 text-left text-[10px] uppercase text-muted-foreground font-black tracking-widest">Date</th>
              <th className="px-5 py-2.5 text-left text-[10px] uppercase text-muted-foreground font-black tracking-widest">Event</th>
              <th className="px-5 py-2.5 text-left text-[10px] uppercase text-muted-foreground font-black tracking-widest">Type</th>
              <th className="px-5 py-2.5 text-center text-[10px] uppercase text-muted-foreground font-black tracking-widest">Impact</th>
              <th className="px-5 py-2.5 text-right text-[10px] uppercase text-muted-foreground font-black tracking-widest">Conf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-muted/10 transition-colors group">
                <td className="px-5 py-3.5 font-bold text-[11px] whitespace-nowrap text-muted-foreground/80 uppercase tracking-widest">
                  {format(new Date(event.event_date), 'MMM d')}
                </td>
                <td className="px-5 py-3.5 text-foreground font-medium leading-relaxed">
                  {event.title}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider
                    ${event.event_type === 'earnings' 
                      ? 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400' 
                      : 'bg-muted/30 border-border/40 text-muted-foreground'
                    }`}>
                    {event.event_type?.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className={`font-black text-xs ${event.impact_score > 7 ? 'text-red-500' : 'text-foreground/70'}`}>
                    {event.impact_score || '-'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {event.confidence < 0.6 && <AlertTriangle className="w-3 h-3 text-yellow-500 opacity-60" />}
                    <span className={`text-[11px] font-bold ${
                      event.confidence > 0.8 ? 'text-emerald-600 dark:text-emerald-500' : 
                      event.confidence < 0.5 ? 'text-orange-500' : 'text-muted-foreground/80'
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
