import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import type { AnalystRating } from '../../types/ticker';


interface AnalystRatingsTableProps {
    ratings?: AnalystRating[];
    currency?: string;
}

export function AnalystRatingsTable({ ratings, currency = 'USD' }: AnalystRatingsTableProps) {
    if (!ratings || ratings.length === 0) return null;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        }).format(val);
    };

    return (
        <Card className="bg-transparent shadow-sm border border-border/50">
            <CardHeader className="pb-3 bg-transparent border-b border-border/50">
                <CardTitle>Analyst Ratings</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="relative w-full overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-muted-foreground border-b border-border/50">
                            <tr>
                                <th className="h-10 px-2 font-medium">Date</th>
                                <th className="h-10 px-2 font-medium">Firm</th>
                                <th className="h-10 px-2 font-medium">Rating</th>
                                <th className="h-10 px-2 font-medium text-right">Target</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {ratings.map((rating) => {
                                const isBuy = rating.rating.toLowerCase().includes('buy') || rating.rating.toLowerCase().includes('outperform');
                                const isSell = rating.rating.toLowerCase().includes('sell') || rating.rating.toLowerCase().includes('underperform');

                                return (
                                    <tr key={rating.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="p-2 font-mono text-xs text-muted-foreground whitespace-nowrap align-top pt-3">
                                            {new Date(rating.rating_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                                        </td>
                                        <td className="p-2">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm text-foreground">{rating.firm}</span>
                                                {rating.analyst_name && (
                                                    <span className="text-xs text-muted-foreground">{rating.analyst_name}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-2 align-top pt-2.5">
                                            <Badge
                                                variant="outline"
                                                className={`
                                                    ${isBuy ? 'border-green-500/30 text-green-500 bg-green-500/5' : ''}
                                                    ${isSell ? 'border-red-500/30 text-red-500 bg-red-500/5' : ''}
                                                    ${!isBuy && !isSell ? 'border-yellow-500/30 text-yellow-500 bg-yellow-500/5' : ''}
                                                `}
                                            >
                                                {(() => {
                                                    const rLower = rating.rating.toLowerCase();
                                                    if (rLower.includes('strong buy')) return 'Strong Buy';
                                                    if (rLower.includes('buy') || rLower.includes('outperform')) return 'Buy';
                                                    if (rLower.includes('sell') || rLower.includes('underperform')) return 'Sell';
                                                    return 'Hold';
                                                })()}
                                            </Badge>
                                        </td>
                                        <td className="p-2 text-right font-mono font-medium align-top pt-3">
                                            {rating.price_target ? formatCurrency(rating.price_target) : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
