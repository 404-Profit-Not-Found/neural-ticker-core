import { useEffect, useState } from 'react';
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

  const fetchEvents = async () => {
    try {
      const { data } = await axios.get(`/api/v1/stocktwits/${symbol}/events`);
      setEvents(data);
    } catch (e) {
      console.warn('No events found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [symbol]);

  if (loading) return <div className="h-24 w-full bg-muted/20 animate-pulse rounded-lg mt-6" />;
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 mt-8">
      <h3 className="flex items-center gap-2 text-xl font-semibold">
        <CalendarIcon className="w-5 h-5" /> Upcoming Catalyst Calendar
      </h3>
      
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground font-semibold">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Event</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-center">Impact Est.</th>
              <th className="px-4 py-3 text-right">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium whitespace-nowrap text-foreground">
                  {format(new Date(event.event_date), 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-3 text-foreground/90 font-medium">
                  {event.title}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize
                    ${event.event_type === 'earnings' 
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                      : 'bg-secondary text-secondary-foreground'
                    }`}>
                    {event.event_type?.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {event.impact_score ? (
                    <span className={`font-bold ${event.impact_score > 7 ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {event.impact_score}<span className="text-[10px] text-muted-foreground font-normal">/10</span>
                    </span>
                  ) : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {event.confidence < 0.6 && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                    <span className={`text-xs ${
                      event.confidence > 0.8 ? 'text-green-400' : 
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
