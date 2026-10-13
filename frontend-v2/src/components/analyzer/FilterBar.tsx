import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { SlidersHorizontal, X, Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/api';
import { useSectors } from '../../hooks/useSectors';
import { Loader2 } from 'lucide-react';

interface FilterBarProps {
  filters: AnalyzerFilters;
  onFilterChange: (
    key: keyof AnalyzerFilters,
    value: AnalyzerFilters[keyof AnalyzerFilters],
  ) => void;
  onReset: () => void;
}

export interface AnalyzerFilters {
  risk: string[];
  aiRating: string[];
  upside: string | null;
  sector: string[];
  overallScore: string | null;
  region: string[];
}

export function FilterBar({
  filters,
  onFilterChange,
  onReset,
}: FilterBarProps) {
  const { data: dynamicSectors, isLoading: isLoadingSectors } = useSectors();

  const activeFilterCount =
    filters.risk.length +
    filters.aiRating.length +
    (filters.upside ? 1 : 0) +
    filters.sector.length +
    (filters.overallScore ? 1 : 0) +
    (filters.region?.length ?? 0);

  const sectors = dynamicSectors || [];

  return (
    // One row: it scrolls sideways on phones (bleeding to the screen edge) and
    // wraps from `lg`, so six filters never push the list below the fold.
    <div
      role="group"
      aria-label="Filters"
      className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
    >
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground" aria-hidden={activeFilterCount === 0}>
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {activeFilterCount > 0 && (
          <span className="num text-xs font-semibold text-signal">
            {activeFilterCount}
            <span className="sr-only"> active filters</span>
          </span>
        )}
      </span>

      {/* 1. AI Rating (Purple) */}
      <FilterButton 
        label="AI Rating" 
        count={filters.aiRating.length} 
        variant="purple"
      >
          <div className="label-micro px-2.5 pb-1.5 pt-1">
            AI Signal
          </div>
          <div>
            {['Strong Buy', 'Buy', 'Hold', 'Sell', 'Speculative Buy'].map((status) => (
              <Item 
                key={status} 
                label={status} 
                selected={filters.aiRating.includes(status)} 
                onClick={() => {
                   const newRatings = filters.aiRating.includes(status)
                      ? filters.aiRating.filter((r) => r !== status)
                      : [...filters.aiRating, status];
                    onFilterChange('aiRating', newRatings);
                }} 
              />
            ))}
          </div>
      </FilterButton>

      {/* 2. Risk Level (Amber) */}
      <FilterButton 
        label="Risk Level" 
        count={filters.risk.length} 
        variant="amber"
      >
         <div className="label-micro px-2.5 pb-1.5 pt-1">
            Risk Profile
          </div>
          <div>
            {['Low (0-3.5)', 'Medium (3.5-6.5)', 'High (6.5+)'].map((level) => (
               <Item 
                key={level} 
                label={level} 
                selected={filters.risk.includes(level)} 
                onClick={() => {
                   const newRisks = filters.risk.includes(level)
                      ? filters.risk.filter((r) => r !== level)
                      : [...filters.risk, level];
                    onFilterChange('risk', newRisks);
                }} 
              />
            ))}
          </div>
      </FilterButton>

      {/* 3. Risk/Reward (Cyan) */}
       <FilterButton 
        label="Risk/Reward" 
        activeValue={filters.overallScore} 
        variant="cyan"
      >
         <div className="label-micro px-2.5 pb-1.5 pt-1">
            Min R/R Score
          </div>
          <div>
            {['> 5.0', '> 7.5', '> 8.5'].map((val) => (
               <Item 
                key={val} 
                label={val} 
                selected={filters.overallScore === val} 
                onClick={() => onFilterChange('overallScore', filters.overallScore === val ? null : val)} 
              />
            ))}
          </div>
      </FilterButton>

      {/* 4. Upside (Emerald) */}
      <FilterButton 
        label="Upside" 
        activeValue={filters.upside} 
        variant="emerald"
      >
         <div className="label-micro px-2.5 pb-1.5 pt-1">
            Min Upside
          </div>
          <div>
            {['> 10%', '> 20%', '> 50%'].map((val) => (
               <Item 
                key={val} 
                label={val} 
                selected={filters.upside === val} 
                onClick={() => onFilterChange('upside', filters.upside === val ? null : val)} 
              />
            ))}
          </div>
      </FilterButton>

      {/* 5. Sector (Blue) */}
      <FilterButton 
        label="Sector" 
        count={filters.sector.length} 
        variant="blue"
      >
         <div className="label-micro px-2.5 pb-1.5 pt-1">
            Sectors
          </div>
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
             {isLoadingSectors ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground text-xs">
                 <Loader2 className="w-3 h-3 animate-spin mr-2" />
                 Loading sectors...
              </div>
            ) : sectors.length === 0 ? (
              <div className="px-2 py-4 text-center text-muted-foreground text-xs">
                No sectors found
              </div>
            ) : (
                sectors.map(sec => (
                   <Item 
                    key={sec} 
                    label={sec} 
                    selected={filters.sector.includes(sec)} 
                     onClick={() => {
                       const newSectors = filters.sector.includes(sec)
                        ? filters.sector.filter((s) => s !== sec)
                        : [...filters.sector, sec];
                      onFilterChange('sector', newSectors);
                    }} 
                  />
                ))
            )}
          </div>
      </FilterButton>

      {/* 6. Market / Region (Rose) */}
      <FilterButton
        label="Market"
        count={filters.region?.length}
        variant="rose"
      >
        <div className="label-micro px-2.5 pb-1.5 pt-1">
          Market Region
        </div>
        <div>
          {(['EU', 'US'] as const).map((region) => (
            <Item
              key={region}
              label={region === 'EU' ? 'EU Stocks' : 'US Stocks'}
              selected={filters.region?.includes(region) ?? false}
              onClick={() => {
                const current = filters.region ?? [];
                const newRegions = current.includes(region)
                  ? current.filter((r) => r !== region)
                  : [...current, region];
                onFilterChange('region', newRegions);
              }}
            />
          ))}
        </div>
      </FilterButton>

      {/* Reset Button */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-11 shrink-0 px-2.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground lg:h-8"
        >
          Reset
          <X className="ml-1.5 w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

// A filter chip: a quiet tonal button; it takes the signal tint (and shows what
// is chosen) once the filter is in use. No outline in either state.
const FilterButton = ({
  label,
  count,
  activeValue,
  children,
}: {
  label: string;
  count?: number;
  activeValue?: string | null;
  /** Kept for callers; every active filter now uses the one "selected" tint. */
  variant?: 'purple' | 'amber' | 'emerald' | 'cyan' | 'blue' | 'rose' | 'default';
  children: React.ReactNode;
}) => {
  const isActive = (count && count > 0) || !!activeValue;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-8 lg:text-xs",
            isActive
              ? "bg-signal/15 text-signal hover:bg-signal/25"
              : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {label}
          {isActive && <span className="num font-semibold">{count ? count : activeValue}</span>}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-1.5 animate-in zoom-in-95 duration-200">
          {children}
      </PopoverContent>
    </Popover>
  );
};

// One option in a filter's menu: a real button, so it is reachable by keyboard.
const Item = ({ label, selected, onClick }: { label: string, selected: boolean, onClick: () => void }) => (
  <button
    type="button"
    role="menuitemcheckbox"
    aria-checked={selected}
    className={cn(
      'flex min-h-11 w-full items-center justify-between rounded-md px-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none lg:min-h-8',
      selected ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
    )}
    onClick={onClick}
  >
    {label}
    {selected && <Check className="h-3.5 w-3.5 text-signal" aria-hidden />}
  </button>
);
