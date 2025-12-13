import React from 'react';
import { FinancialHealth } from './FinancialHealth';
import type { TickerData } from '../../types/ticker';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../ui/toast';
import { api } from '../../lib/api';

interface TickerFinancialsProps {
    symbol: string; // Needed for API call
    fundamentals: TickerData['fundamentals'];

}

export function TickerFinancials({ symbol, fundamentals }: TickerFinancialsProps) {
    const [isSyncing, setIsSyncing] = React.useState(false);
    const queryClient = useQueryClient();
    const { showToast } = useToast();

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            await api.post(`/research/extract-financials/${symbol}`); // api client handles cookies & base URL

            await queryClient.invalidateQueries({ queryKey: ['ticker', symbol] });
            showToast('Financial data synced successfully', 'success');
        } catch (e) {
            console.error('Sync failed', e);
            showToast('Failed to sync data', 'error');
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
                        className="px-3 py-1 text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 rounded border border-blue-800 transition-colors disabled:opacity-50"
                    >
                        {isSyncing ? 'Syncing...' : 'Sync Data'}
                    </button>
                </CardHeader>
                <CardContent>
                    <FinancialHealth fundamentals={fundamentals} />
                </CardContent>
            </Card>


        </div>
    );
}
