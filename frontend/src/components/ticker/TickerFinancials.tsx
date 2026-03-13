import { FinancialHealth } from './FinancialHealth';
import type { TickerData } from '../../types/ticker';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

interface TickerFinancialsProps {
    fundamentals: TickerData['fundamentals'];
    currency?: string;
}

export function TickerFinancials({ fundamentals, currency }: TickerFinancialsProps) {


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Financial Health</CardTitle>
                </CardHeader>
                <CardContent>
                    <FinancialHealth fundamentals={fundamentals} currency={currency} />
                </CardContent>
            </Card>


        </div>
    );
}
