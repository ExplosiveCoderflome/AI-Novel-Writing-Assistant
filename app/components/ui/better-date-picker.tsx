/*
 * @LastEditors: biz
 */
"use client"

import React from "react"
import DatePicker from "react-datepicker"
import { zhCN } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import "react-datepicker/dist/react-datepicker.css"

interface BetterDatePickerProps {
  date: Date | undefined
  setDate: (date: Date | undefined) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

export function BetterDatePicker({
  date,
  setDate,
  className,
  placeholder = "选择日期",
  disabled = false,
}: BetterDatePickerProps) {
  const CustomInput = React.forwardRef(
    ({ value, onClick }: { value?: string; onClick?: () => void }, ref: React.Ref<HTMLButtonElement>) => (
      <Button
        variant="outline"
        ref={ref}
        onClick={onClick}
        className={cn(
          "w-full justify-start text-left font-normal",
          !value && "text-muted-foreground",
          className
        )}
        disabled={disabled}
        type="button"
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value || <span>{placeholder}</span>}
      </Button>
    )
  )
  CustomInput.displayName = "DatePickerCustomInput"

  return (
    <DatePicker
      selected={date}
      onChange={(date: Date) => setDate(date)}
      locale={zhCN}
      dateFormat="yyyy年MM月dd日"
      showYearDropdown
      showMonthDropdown
      dropdownMode="select"
      customInput={<CustomInput />}
      isClearable={false}
    />
  )
} 