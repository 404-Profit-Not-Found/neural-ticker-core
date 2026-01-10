import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/api';

interface MarketStatusProps {
    className?: string;
}

interface StatusData {
    isOpen: boolean;
    holiday?: string | null;
    exchange: string;
    session?: string;
    timezone?: string;
    t?: number;
}

export function MarketStatus({ className }: MarketStatusProps) {
    const [status, setStatus] = useState<StatusData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const { data } = await api.get('/tickers/US/status', { params: { exchange: 'US' } });
                setStatus(data);
            } catch (error) {
                console.error('Failed to fetch market status', error);
                // Fallback or retry logic could go here
            } finally {
                setLoading(false);
            }
        };

        fetchStatus();
        // Poll every minute
        const interval = setInterval(fetchStatus, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return <div className={cn("animate-pulse w-24 h-6 bg-muted rounded-full", className)} />;
    }

    if (!status) return null;

    const isOpen = status.isOpen;

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <Badge
                variant={isOpen ? "outline" : "outline"}
                className={cn(
                    "pl-1.5 pr-2.5 py-0.5 h-6 font-medium border transition-colors flex items-center gap-1.5",
                    isOpen
                        ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                        : "text-amber-500 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
                )}
            >
                <span className={cn("relative flex h-2 w-2")}>
                  {isOpen && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={cn("relative inline-flex rounded-full h-2 w-2", isOpen ? "bg-emerald-500" : "bg-amber-500")}></span>
                </span>
                {status.holiday ? `Closed: ${status.holiday}` : isOpen ? 'Market Open' : 'Market Closed'}
            </Badge>
        </div>
    );
}
