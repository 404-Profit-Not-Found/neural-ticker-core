import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { SlidersHorizontal, X, Check } from 'lucide-react';
import { Badge } from '../ui/badge';
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
    (filters.overallScore ? 1 : 0);

  const sectors = dynamicSectors || [];

  // Helper for Colorful Border Buttons (No Shadow)
  const FilterButton = ({
    label,
    count,
    activeValue,
    variant = 'default',
    children,
  }: {
    label: string;
    count?: number;
    activeValue?: string | null;
    variant?: 'purple' | 'amber' | 'emerald' | 'cyan' | 'blue' | 'default';
    children: React.ReactNode;
  }) => {
    const isActive = (count && count > 0) || !!activeValue;
    
    // Base: H-8, px-3, border, transition
    const baseStyles = "h-8 px-3 text-xs font-medium border transition-colors duration-200";
    
    // Inactive: Standard dashed outline
    const inactiveStyles = "border-dashed border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground";
    
    // Active Variant Styles
    // Design: Solid Colored Border + Colored Text + Subtle Background Tint
    // Dark/Light Support: Text is 600 (light) / 400 (dark). Bg is 500/10 (universal). Border is 500/50.
    const activeStyles = {
      purple:  "border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20",
      amber:   "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20",
      emerald: "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20",
      cyan:    "border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20",
      blue:    "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20",
      default: "border-primary text-primary bg-primary/10 hover:bg-primary/20",
    };

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              baseStyles,
              "rounded-md flex items-center gap-2",
              isActive ? activeStyles[variant] : inactiveStyles
            )}
          >
            {label}
            {isActive && (
              <div className="flex items-center gap-1.5 ml-0.5">
                <div className={cn("h-3.5 w-[1px]", isActive ? "bg-current/40" : "bg-border")} />
                <span className="font-bold">
                  {count ? count : activeValue}
                </span>
              </div>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[200px] p-0 animate-in zoom-in-95 duration-200">
            {children}
        </PopoverContent>
      </Popover>
    );
  };

  // Shared Item Style
  const Item = ({ label, selected, onClick }: { label: string, selected: boolean, onClick: () => void }) => (
    <div
      className={cn(
        'flex items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer group',
        selected && 'bg-accent/50 text-accent-foreground'
      )}
      onClick={onClick}
    >
      <span className={cn("transition-colors", selected ? "font-medium" : "text-muted-foreground group-hover:text-foreground")}>
        {label}
      </span>
      {selected && <Check className="h-3.5 w-3.5 text-primary animate-in zoom-in duration-200" />}
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 p-1 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Label */}
      <div className="flex items-center gap-2 mr-2 text-muted-foreground/80">
        <SlidersHorizontal className="w-4 h-4" />
        {activeFilterCount > 0 && (
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-[10px] rounded-full"
          >
            {activeFilterCount}
          </Badge>
        )}
      </div>

      {/* 1. AI Rating (Purple) */}
      <FilterButton 
        label="AI Rating" 
        count={filters.aiRating.length} 
        variant="purple"
      >
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b bg-muted/30">
            AI Signal
          </div>
          <div className="p-1">
            {['Strong Buy', 'Buy', 'Hold', 'Sell'].map((status) => (
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
         <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b bg-muted/30">
            Risk Profile
          </div>
          <div className="p-1">
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
         <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b bg-muted/30">
            Min R/R Score
          </div>
          <div className="p-1">
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
         <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b bg-muted/30">
            Min Upside
          </div>
          <div className="p-1">
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
         <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b bg-muted/30">
            Sectors
          </div>
          <div className="p-1 max-h-[300px] overflow-y-auto custom-scrollbar">
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

      {/* Reset Button */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
        >
          Reset
          <X className="ml-1.5 w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
