"use client";

import * as React from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  onSelect: (startDate: string, endDate: string) => void;
  onActivate: () => void;
}

export function DateRangePicker({
  isActive,
  startDate,
  endDate,
  onSelect,
  onActivate,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [tempStart, setTempStart] = React.useState<Date | undefined>(
    startDate ? new Date(startDate) : undefined
  );
  const [tempEnd, setTempEnd] = React.useState<Date | undefined>(
    endDate ? new Date(endDate) : undefined
  );
  const [selectingStart, setSelectingStart] = React.useState(true);

  React.useEffect(() => {
    if (startDate) setTempStart(new Date(startDate));
    if (endDate) setTempEnd(new Date(endDate));
  }, [startDate, endDate]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    if (selectingStart) {
      setTempStart(date);
      setTempEnd(undefined);
      setSelectingStart(false);
    } else {
      // Ensure end is after start
      if (tempStart && date < tempStart) {
        setTempEnd(tempStart);
        setTempStart(date);
      } else {
        setTempEnd(date);
      }
      setSelectingStart(true);
    }
  };

  const handleApply = () => {
    if (tempStart && tempEnd) {
      const startStr = tempStart.toISOString().split('T')[0];
      const endStr = tempEnd.toISOString().split('T')[0];
      onSelect(startStr, endStr);
      setIsOpen(false);
    }
  };

  const handleOpen = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      onActivate();
      // Reset temp values when opening
      setTempStart(startDate ? new Date(startDate) : undefined);
      setTempEnd(endDate ? new Date(endDate) : undefined);
      setSelectingStart(true);
    }
  };

  const formatDisplayDate = () => {
    if (!startDate || !endDate) return "Velg";
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${format(start, "d. MMM", { locale: nb })} - ${format(end, "d. MMM", { locale: nb })}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          size="sm"
          className={`h-7 px-2.5 text-xs gap-1.5 ${
            isActive ? 'bg-white shadow-sm' : 'hover:bg-gray-100'
          }`}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {isActive && startDate && endDate ? formatDisplayDate() : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900 mb-1">
            Velg datoperiode
          </p>
          <p className="text-xs text-gray-500">
            {selectingStart ? "Velg startdato" : "Velg sluttdato"}
          </p>
        </div>

        <Calendar
          mode="single"
          selected={selectingStart ? tempStart : tempEnd}
          onSelect={handleDateSelect}
          locale={nb}
          disabled={(date) => date > new Date()}
          modifiers={{
            range: tempStart && tempEnd
              ? { from: tempStart, to: tempEnd }
              : undefined,
            rangeStart: tempStart,
            rangeEnd: tempEnd,
          }}
          modifiersStyles={{
            range: { backgroundColor: 'rgb(219 234 254)' },
            rangeStart: { backgroundColor: 'rgb(59 130 246)', color: 'white', borderRadius: '4px 0 0 4px' },
            rangeEnd: { backgroundColor: 'rgb(59 130 246)', color: 'white', borderRadius: '0 4px 4px 0' },
          }}
          className="rounded-md"
        />

        <div className="p-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="text-xs text-gray-500 min-w-[180px] h-5">
            {tempStart && (
              <span>
                {format(tempStart, "d. MMM yyyy", { locale: nb })}
                {tempEnd && ` - ${format(tempEnd, "d. MMM yyyy", { locale: nb })}`}
              </span>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsOpen(false)}
            >
              Avbryt
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!tempStart || !tempEnd}
              onClick={handleApply}
            >
              Bruk
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
