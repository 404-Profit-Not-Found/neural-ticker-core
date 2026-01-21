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
    <div className={cn("p-3 w-[280px] bg-popover border border-border rounded-lg shadow-lg", className)}>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={handlePrevMonth} className="h-7 w-7 p-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </div>
        <Button variant="ghost" size="sm" onClick={handleNextMonth} className="h-7 w-7 p-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <div key={day} className="h-6 flex items-center justify-center font-medium">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isEnabled = isDateEnabled(day);
          const isSelected = isSameDay(day, value);
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <button
              key={day.toISOString()}
              onClick={() => isEnabled && onChange(day)}
              disabled={!isEnabled}
              className={cn(
                "h-8 w-8 text-xs rounded-md flex items-center justify-center transition-colors relative",
                !isCurrentMonth && "text-muted-foreground/30",
                isCurrentMonth && !isEnabled && "text-muted-foreground/50 line-through decoration-muted-foreground/50",
                isCurrentMonth && isEnabled && !isSelected && "hover:bg-accent hover:text-accent-foreground",
                isSelected && "bg-primary text-primary-foreground font-bold hover:bg-primary/90",
                isToday(day) && !isSelected && "border border-primary text-primary"
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
