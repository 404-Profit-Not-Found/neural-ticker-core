
import { FinancialHealth } from './FinancialHealth';
import type { TickerData } from '../../types/ticker';

interface TickerFinancialsProps {
    fundamentals: TickerData['fundamentals'];
}

export function TickerFinancials({ fundamentals }: TickerFinancialsProps) {
    return (
        <section className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-bold mb-6">Financial Health</h3>
            <FinancialHealth fundamentals={fundamentals} />
            {/* Placeholder for more detailed financials if available in the future */}
            <div className="mt-8 pt-8 border-t border-border text-center text-muted-foreground text-xs uppercase tracking-widest">
                End of Financial Data
            </div>
        </section>
    );
}
