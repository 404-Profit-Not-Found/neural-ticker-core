import React from 'react';
import { FinancialHealth } from './FinancialHealth';
import type { TickerData } from '../../types/ticker';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AnalystRatingsTable } from './AnalystRatingsTable';

interface TickerFinancialsProps {
    symbol: string; // Needed for API call
    fundamentals: TickerData['fundamentals'];
    ratings?: TickerData['ratings'];
}

export function TickerFinancials({ symbol, fundamentals, ratings }: TickerFinancialsProps) {
    const [isSyncing, setIsSyncing] = React.useState(false);

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            const token = localStorage.getItem('token');
            await fetch(`http://localhost:3000/api/v1/research/extract-financials/${symbol}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            // Ideally toast success or refresh page
            window.location.reload();
        } catch (e) {
            console.error('Sync failed', e);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Financial Health</CardTitle>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="px-3 py-1 text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 rounded border border-blue-800 transition-colors"
                    >
                        {isSyncing ? 'Syncing...' : 'Sync Data'}
                    </button>
                </CardHeader>
                <CardContent>
                    <FinancialHealth fundamentals={fundamentals} />
                </CardContent>
            </Card>

            <AnalystRatingsTable ratings={ratings} />
        </div>
    );
}
