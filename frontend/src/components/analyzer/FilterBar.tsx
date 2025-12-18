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
    filters.risk.length + filters.aiRating.length + (filters.upside ? 1 : 0) + filters.sector.length + (filters.overallScore ? 1 : 0);

  const sectors = dynamicSectors || [];

  return (
    <div className="flex flex-wrap items-center gap-2 p-1 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Main Filter Icon / Label */}
      <div className="flex items-center gap-2 mr-2 text-muted-foreground">
        <SlidersHorizontal className="w-4 h-4" />
        <span className="text-sm font-medium">Filters</span>
        {activeFilterCount > 0 && (
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-[10px] rounded-full"
          >
            {activeFilterCount}
          </Badge>
        )}
      </div>

      {/* AI Rating Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={filters.aiRating.length ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 border-dashed"
          >
            AI Rating
            {filters.aiRating.length > 0 && (
              <>
                <span className="mx-2 h-4 w-[1px] bg-border" />
                <span className="text-xs">
                  {filters.aiRating.length} selected
                </span>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[200px] p-0">
          <div className="px-2 py-1.5 text-sm font-semibold border-b">
            AI Signal
          </div>
          <div className="p-1">
            {['Strong Buy', 'Buy', 'Hold', 'Sell'].map((status) => {
              const isSelected = filters.aiRating.includes(status);
              return (
                <div
                  key={status}
                  className={cn(
                    'flex items-center space-x-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer',
                  )}
                  onClick={() => {
                    const newRatings = isSelected
                      ? filters.aiRating.filter((r) => r !== status)
                      : [...filters.aiRating, status];
                    onFilterChange('aiRating', newRatings);
                  }}
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border border-primary',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible',
                    )}
                  >
                    <Check className={cn('h-3 w-3')} />
                  </div>
                  <span>{status}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Risk Level Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={filters.risk.length ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 border-dashed"
          >
            Risk Level
            {filters.risk.length > 0 && (
              <>
                <span className="mx-2 h-4 w-[1px] bg-border" />
                <span className="text-xs">{filters.risk.length} selected</span>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[200px] p-0">
          <div className="px-2 py-1.5 text-sm font-semibold border-b">
            Risk Profile
          </div>
          <div className="p-1">
            {['Low (0-3.5)', 'Medium (3.5-6.5)', 'High (6.5+)'].map((level) => {
              const isSelected = filters.risk.includes(level);
              return (
                <div
                  key={level}
                  className={cn(
                    'flex items-center space-x-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer',
                  )}
                  onClick={() => {
                    const newRisks = isSelected
                      ? filters.risk.filter((r) => r !== level)
                      : [...filters.risk, level];
                    onFilterChange('risk', newRisks);
                  }}
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border border-primary',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible',
                    )}
                  >
                    <Check className={cn('h-3 w-3')} />
                  </div>
                  <span>{level}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Risk/Reward Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={filters.overallScore ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 border-dashed"
          >
            Risk/Reward
            {filters.overallScore && (
              <>
                <span className="mx-2 h-4 w-[1px] bg-border" />
                <span className="text-xs">{filters.overallScore}</span>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[200px] p-0">
          <div className="px-2 py-1.5 text-sm font-semibold border-b">
            Min Risk/Reward Coefficient
          </div>
          <div className="p-1">
            {['> 5.0', '> 7.5', '> 8.5'].map((val) => {
              const isSelected = filters.overallScore === val;
              return (
                <div
                  key={val}
                  className={cn(
                    'flex items-center space-x-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer',
                  )}
                  onClick={() => {
                    onFilterChange('overallScore', isSelected ? null : val);
                  }}
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full border border-primary',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible',
                    )}
                  >
                    <Check className={cn('h-3 w-3')} />
                  </div>
                  <span>{val}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Upside Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={filters.upside ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 border-dashed"
          >
            Upside Potential
            {filters.upside && (
              <>
                <span className="mx-2 h-4 w-[1px] bg-border" />
                <span className="text-xs">{filters.upside}</span>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[200px] p-0">
          <div className="px-2 py-1.5 text-sm font-semibold border-b">
            Minimum Upside
          </div>
          <div className="p-1">
            {['> 10%', '> 20%', '> 50%'].map((val) => {
              const isSelected = filters.upside === val;
              return (
                <div
                  key={val}
                  className={cn(
                    'flex items-center space-x-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer',
                  )}
                  onClick={() => {
                    onFilterChange('upside', isSelected ? null : val);
                  }}
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full border border-primary',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible',
                    )}
                  >
                    <Check className={cn('h-3 w-3')} />
                  </div>
                  <span>{val}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Sector Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={filters.sector.length ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 border-dashed"
          >
            Sector
            {filters.sector.length > 0 && (
              <>
                <span className="mx-2 h-4 w-[1px] bg-border" />
                <span className="text-xs">{filters.sector.length} selected</span>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[240px] p-0">
          <div className="px-2 py-1.5 text-sm font-semibold border-b">
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
              sectors.map((sec) => {
                const isSelected = filters.sector.includes(sec);
                return (
                  <div
                    key={sec}
                    className={cn(
                      'flex items-center space-x-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer',
                    )}
                    onClick={() => {
                      const newSectors = isSelected
                        ? filters.sector.filter((s) => s !== sec)
                        : [...filters.sector, sec];
                      onFilterChange('sector', newSectors);
                    }}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className={cn('h-3 w-3')} />
                    </div>
                    <span className="truncate">{sec}</span>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Reset Button */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-8 px-2 lg:px-3 text-muted-foreground hover:text-foreground"
        >
          Reset
          <X className="ml-2 w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
