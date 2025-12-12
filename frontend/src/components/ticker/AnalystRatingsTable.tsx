import type { AnalystRating } from '../../types/ticker';

interface AnalystRatingsTableProps {
    ratings?: AnalystRating[];
}

export function AnalystRatingsTable({ ratings }: AnalystRatingsTableProps) {
    if (!ratings || ratings.length === 0) return null;

    return (
        <div className="w-full mt-6 bg-[#0B1221] border border-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-bold text-gray-100 mb-4">Analyst Ratings</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-900/50">
                        <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Firm</th>
                            <th className="px-4 py-3">Analyst</th>
                            <th className="px-4 py-3">Rating</th>
                            <th className="px-4 py-3 text-right">Target</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ratings.map((rating) => (
                            <tr key={rating.id} className="border-b border-gray-800 hover:bg-gray-800/20">
                                <td className="px-4 py-3">{rating.rating_date}</td>
                                <td className="px-4 py-3 font-medium text-white">{rating.firm}</td>
                                <td className="px-4 py-3">{rating.analyst_name || '-'}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded text-xs font-semibold
                                        ${rating.rating.toLowerCase().includes('buy') || rating.rating.toLowerCase().includes('outperform') ? 'bg-green-900/30 text-green-400' :
                                            rating.rating.toLowerCase().includes('sell') ? 'bg-red-900/30 text-red-400' :
                                                'bg-yellow-900/30 text-yellow-400'}`}>
                                        {rating.rating}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                    {rating.price_target ? `$${rating.price_target}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
