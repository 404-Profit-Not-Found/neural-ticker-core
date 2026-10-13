import { useState, useMemo } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/api';

interface SimpleCalendarProps {
  value: Date;
  onChange: (date: Date) => void;
  enabledDates?: Set<string>; // ISO date strings YYYY-MM-DD
  className?: string;
}

export function SimpleCalendar({ value, onChange, enabledDates, className }: SimpleCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(value));

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentMonth]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  
  const isDateEnabled = (date: Date) => {
    if (!enabledDates) return true;
    const dateStr = format(date, 'yyyy-MM-dd');
    return enabledDates.has(dateStr);
  };

  return (
    <div className={cn("w-[20rem] max-w-[calc(100vw-2rem)] rounded-lg bg-popover p-3 shadow-xl shadow-black/50", className)}>
      <div className="mb-2 flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={handlePrevMonth} className="h-10 w-10 p-0" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleNextMonth} className="h-10 w-10 p-0" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <div key={day} className="h-6 flex items-center justify-center font-medium">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const isEnabled = isDateEnabled(day);
          const isSelected = isSameDay(day, value);
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => isEnabled && onChange(day)}
              disabled={!isEnabled}
              aria-label={format(day, 'PPP')}
              aria-pressed={isSelected}
              className={cn(
                // 40px cells: a date can be hit with a thumb.
                "num relative flex h-10 w-full items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !isCurrentMonth && "text-muted-foreground opacity-40",
                isCurrentMonth && !isEnabled && "text-muted-foreground line-through",
                isCurrentMonth && isEnabled && !isSelected && "hover:bg-accent hover:text-accent-foreground",
                isSelected && "bg-primary text-primary-foreground font-bold hover:bg-primary/90",
                isToday(day) && !isSelected && "bg-primary/15 font-semibold text-blue-400"
              )}
            >
              {format(day, 'd')}
              {/* Dot indicator for available data */}
              {isEnabled && !isSelected && isCurrentMonth && (
                 <div className="absolute bottom-1 w-0.5 h-0.5 rounded-full bg-primary/50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
