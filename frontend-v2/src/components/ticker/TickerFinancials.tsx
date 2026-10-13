import { BarChart3 } from 'lucide-react';
import { FinancialHealth } from './FinancialHealth';
import type { TickerData } from '../../types/ticker';
import { Panel, PanelHeader, PanelBody } from '../ui/panel';
import { EmptyState } from '../ui/empty-state';

interface TickerFinancialsProps {
    fundamentals: TickerData['fundamentals'];
    currency?: string;
}

export function TickerFinancials({ fundamentals, currency }: TickerFinancialsProps) {
    return (
        <Panel aria-label="Fundamentals">
            <PanelHeader title="Fundamentals" led={null} />
            {fundamentals ? (
                <PanelBody>
                    <FinancialHealth fundamentals={fundamentals} currency={currency} />
                </PanelBody>
            ) : (
                <EmptyState
                    icon={<BarChart3 className="h-5 w-5" />}
                    title="No fundamentals yet"
                    description="Financial statements for this ticker have not been loaded."
                />
            )}
        </Panel>
    );
}
