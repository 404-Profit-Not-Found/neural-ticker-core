import { FinancialHealth } from './FinancialHealth';
import type { TickerData } from '../../types/ticker';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

interface TickerFinancialsProps {
    fundamentals: TickerData['fundamentals'];
}

export function TickerFinancials({ fundamentals }: TickerFinancialsProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Financial Health</CardTitle>
            </CardHeader>
            <CardContent>
                <FinancialHealth fundamentals={fundamentals} />
                {/* Placeholder for more detailed financials if available in the future */}
                <div className="mt-8 pt-8 border-t border-border text-center text-muted-foreground text-xs uppercase tracking-widest">
                    End of Financial Data
                </div>
            </CardContent>
        </Card>
    );
}
