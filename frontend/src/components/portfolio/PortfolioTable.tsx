import { Trash2, Edit2, ArrowUp, ArrowDown, Brain, Newspaper, MessageCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../ui/data-table';
import { TickerLogo } from '../dashboard/TickerLogo';
import { useNavigate } from 'react-router-dom';
import { calculateLiveUpside } from '../../lib/rating-utils';
import { VerdictBadge } from "../ticker/VerdictBadge";
import { FiftyTwoWeekRange } from '../dashboard/FiftyTwoWeekRange';
import { Sparkline } from '../ui/Sparkline';

export interface Position {
    id: string;
    symbol: string;
    shares: string | number;
    buy_price: string | number;
    current_price: number;
    change_percent: number;
    current_value: number;
    cost_basis: number;
    gain_loss: number;
    gain_loss_percent: number;
    
    // Sparkline & Range
    sparkline?: number[];
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;

    // Enriched Backend Data
    ticker?: {
        logo_url?: string;
        name?: string;
        sector?: string;
        industry?: string;
    };
    fundamentals?: {
        pe_ttm?: number;
        consensus_rating?: string;
        sector?: string;
    };
    aiAnalysis?: {
        financial_risk?: number;
        overall_score?: number;
        upside_percent?: number;
        base_price?: number;
        bear_price?: number;
    };
    counts?: {
        analysts?: number;
        news?: number;
        research?: number;
        social?: number;
    }
}

interface PortfolioTableProps {
    positions: Position[];
    onDelete: (id: string) => void;
    onEdit?: (position: Position) => void;
    loading: boolean;
}

// Helpers
const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

const formatPct = (val: number) =>
    `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;


export function PortfolioTable({ positions, onDelete, onEdit, loading }: PortfolioTableProps) {
    const navigate = useNavigate();
    const columnHelper = createColumnHelper<Position>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: ColumnDef<Position, any>[] = [
        // 1. Asset Column
        columnHelper.accessor('symbol', {
            header: 'Asset',
            cell: (info) => {
                const ticker = info.row.original.ticker;
                const fundamentals = info.row.original.fundamentals;
                const counts = info.row.original.counts;
                const showCounts = (counts?.research || 0) + (counts?.news || 0) + (counts?.social || 0) > 0;

                return (
                    <div className="flex items-start gap-3 min-w-[140px]">
                        <TickerLogo
                            url={ticker?.logo_url}
                            symbol={info.getValue()}
                            className="w-10 h-10 rounded-full"
                        />
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-foreground hover:underline cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/ticker/${info.getValue()}`);
                                    }}
                                >{info.getValue()}</span>

                                {showCounts && (
                                    <div className="flex items-center gap-2">
                                        {counts?.research ? (
                                            <div className="flex items-center gap-0.5 text-purple-400" title={`${counts.research} Reports`}>
                                                <Brain size={10} />
                                                <span className="text-[9px] font-medium">{counts.research}</span>
                                            </div>
                                        ) : null}
                                        {counts?.news ? (
                                            <div className="flex items-center gap-0.5 text-sky-400" title={`${counts.news} News`}>
                                                <Newspaper size={10} />
                                                <span className="text-[9px] font-medium">{counts.news}</span>
                                            </div>
                                        ) : null}
                                        {counts?.social ? (
                                            <div className="flex items-center gap-0.5 text-blue-400" title={`${counts.social} Social`}>
                                                <MessageCircle size={10} />
                                                <span className="text-[9px] font-medium">{counts.social}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {ticker?.name || 'Unknown'}
                            </span>
                            <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">
                                {ticker?.industry || ticker?.sector || fundamentals?.sector || 'Unknown Sector'}
                            </span>
                        </div>
                    </div>
                );
            }
        }),

        // 2. Value (Moved Here)
        columnHelper.accessor('current_value', {
            header: () => <span className="hidden md:inline">Value</span>,
            cell: (info) => <span className="hidden md:inline font-bold text-foreground">{formatCurrency(info.getValue())}</span>
        }),

        // 3. Position (Shares) (Moved Here)
        columnHelper.accessor('shares', {
            header: 'Position',
            cell: (info) => (
                <div className="flex flex-col min-w-[80px]">
                    <span className="text-sm font-bold">{Number(info.getValue()).toFixed(2)} sh</span>
                    <span className="text-xs text-muted-foreground">Avg: {formatCurrency(Number(info.row.original.buy_price))}</span>
                </div>
            )
        }),

        // 4. Price / Change
        columnHelper.accessor('current_price', {
            header: 'Price / Change',
            cell: (info) => {
                const price = info.getValue();
                const change = info.row.original.change_percent || 0;
                const isPositive = change >= 0;

                return (
                    <div className="flex flex-col items-start min-w-[90px]">
                        <span className="text-sm font-mono font-medium text-foreground/90">
                            {formatCurrency(price)}
                        </span>
                        <div className={cn("flex items-center text-xs font-bold", isPositive ? "text-emerald-500" : "text-red-500")}>
                            {isPositive ? <ArrowUp size={12} className="mr-0.5" /> : <ArrowDown size={12} className="mr-0.5" />}
                            {Math.abs(change).toFixed(2)}%
                        </div>
                    </div>
                );
            }
        }),

        // 5. Trend (14d)
        columnHelper.accessor('sparkline', {
            header: () => <span className="hidden md:inline">Trend (14d)</span>,
            cell: (info) => {
                const data = info.getValue();
                if (!data || data.length === 0) return <span className="hidden md:inline text-muted-foreground text-xs">-</span>;
                return (
                    <div className="hidden md:flex w-[100px] h-8 items-center justify-center">
                        <Sparkline
                            data={data}
                            width={100}
                            height={32}
                            className="opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                    </div>
                );
            }
        }),

        // 6. 52-Week Range
         columnHelper.accessor(row => row.fiftyTwoWeekHigh, { // Accessor key
            id: '52wk',
            header: () => <span className="hidden lg:inline">52-Week Range</span>,
            cell: (info) => {
                const row = info.row.original;
                if (!row.fiftyTwoWeekHigh || !row.fiftyTwoWeekLow) return <span className="hidden lg:inline text-muted-foreground text-xs">-</span>;
                return (
                    <div className="hidden lg:block w-[140px]">
                        <FiftyTwoWeekRange
                            low={row.fiftyTwoWeekLow}
                            high={row.fiftyTwoWeekHigh}
                            current={row.current_price}
                            showLabels={true} // Small labels
                            className="scale-90 origin-left"
                        />
                    </div>
                );
            }
        }),

        // 7. Total Return
        columnHelper.accessor('gain_loss', {
            header: () => <span className="hidden md:inline">Total Return</span>,
            cell: (info) => {
                const val = info.getValue();
                const pct = info.row.original.gain_loss_percent;
                const isProfit = val >= 0;

                return (
                    <div className={cn("hidden md:flex flex-col items-start font-medium", isProfit ? "text-emerald-500" : "text-red-500")}>
                        <div className="flex items-center gap-1">
                            <span className="font-mono font-bold text-sm">
                                {val > 0 ? '+' : ''}{formatCurrency(val)}
                            </span>
                        </div>
                        <span className="text-xs opacity-80">
                            {formatPct(pct)}
                        </span>
                    </div>
                );
            }
        }),

        // REMOVED P/E, Risk, Risk/Reward columns

        // 8. Upside
        columnHelper.accessor((row) => row.aiAnalysis?.base_price, {
            id: 'upside',
            header: () => <span className="hidden md:inline">Upside</span>,
            cell: (info) => {
                const basePrice = info.getValue();
                const price = info.row.original.current_price;
                const upside = calculateLiveUpside(price, basePrice, info.row.original.aiAnalysis?.upside_percent);
                const isPositive = upside > 0;
                return (
                    <div className={cn('hidden md:flex items-center font-bold text-xs', isPositive ? 'text-emerald-500' : 'text-muted-foreground')}>
                        {isPositive && <ArrowUp size={12} className="mr-0.5" />}
                        {upside.toFixed(1)}%
                    </div>
                );
            },
        }),

        // 9. AI Rating
        columnHelper.accessor((row) => row.aiAnalysis?.financial_risk, {
            id: 'ai_rating',
            header: () => <span className="hidden md:inline">AI Rating</span>,
            cell: (info) => {
                const riskRaw = info.row.original.aiAnalysis?.financial_risk;
                const risk = typeof riskRaw === 'number' ? riskRaw : 0;
                const price = info.row.original.current_price;
                
                // Calculate Upside/Downside for the badge
                const upside = calculateLiveUpside(
                    price, 
                    info.row.original.aiAnalysis?.base_price, 
                    info.row.original.aiAnalysis?.upside_percent
                );
                
                let downside = 0;
                const bearPrice = info.row.original.aiAnalysis?.bear_price;
                if (typeof bearPrice === 'number' && price > 0) {
                    downside = ((bearPrice - price) / price) * 100;
                } else if (risk > 0) {
                    downside = -(risk * 2.5); // Fallback estimate
                }

                return (
                    <div className="hidden md:block">
                        <VerdictBadge 
                            risk={risk}
                            upside={upside}
                            downside={downside}
                            overallScore={info.row.original.aiAnalysis?.overall_score}
                            consensus={info.row.original.fundamentals?.consensus_rating}
                            pe={info.row.original.fundamentals?.pe_ttm}
                        />
                    </div>
                );
            }
        }),

        // 10. Actions
        columnHelper.display({
            id: 'actions',
            header: 'Actions',
            cell: (info) => (
                <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                    {onEdit && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(info.row.original);
                            }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Edit Position"
                        >
                            <Edit2 size={14} />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(info.row.original.id);
                        }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete Position"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        })
    ];

    if (loading && positions.length === 0) {
        return (
            <div className="w-full mt-6">
                <DataTable columns={columns} data={[]} isLoading={true} />
            </div>
        );
    }

    if (positions.length === 0 && !loading) {
        return (
            <div className="mt-8 p-12 text-center border border-dashed border-border rounded-xl bg-muted/20">
                <h3 className="text-xl font-medium text-foreground">Your portfolio is empty</h3>
                <p className="text-muted-foreground mt-2">Add your first position to start tracking performance and get AI insights.</p>
            </div>
        );
    }

    return (
        <div>
            <DataTable
                columns={columns}
                data={positions}
                onRowClick={(row) => navigate(`/ticker/${row.symbol}`)}
            />
        </div>
    );
}
