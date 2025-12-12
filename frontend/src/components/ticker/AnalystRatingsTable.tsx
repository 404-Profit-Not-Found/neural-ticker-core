import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import type { AnalystRating } from '../../types/ticker';


interface AnalystRatingsTableProps {
    ratings?: AnalystRating[];
}

export function AnalystRatingsTable({ ratings }: AnalystRatingsTableProps) {
    if (!ratings || ratings.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle>Analyst Ratings</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="relative w-full overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-muted-foreground border-b border-border/50">
                            <tr>
                                <th className="h-10 px-2 font-medium">Date</th>
                                <th className="h-10 px-2 font-medium">Firm</th>
                                <th className="h-10 px-2 font-medium">Analyst</th>
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
                                        <td className="p-2 font-mono text-xs text-muted-foreground">{rating.rating_date}</td>
                                        <td className="p-2 font-medium text-foreground">{rating.firm}</td>
                                        <td className="p-2 text-muted-foreground">{rating.analyst_name || '-'}</td>
                                        <td className="p-2">
                                            <Badge
                                                variant="outline"
                                                className={`
                                                    ${isBuy ? 'border-green-500/30 text-green-500 bg-green-500/5' : ''}
                                                    ${isSell ? 'border-red-500/30 text-red-500 bg-red-500/5' : ''}
                                                    ${!isBuy && !isSell ? 'border-yellow-500/30 text-yellow-500 bg-yellow-500/5' : ''}
                                                `}
                                            >
                                                {rating.rating}
                                            </Badge>
                                        </td>
                                        <td className="p-2 text-right font-mono font-medium">
                                            {rating.price_target ? `$${rating.price_target.toFixed(2)}` : '-'}
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
