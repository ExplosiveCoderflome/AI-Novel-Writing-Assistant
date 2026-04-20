import { useId } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMPTY_OPTION_VALUE = "__select_field_empty__";

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  value?: string;
  onValueChange: (value: string) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  label?: string;
  description?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export default function SelectField({
  value,
  onValueChange,
  options,
  placeholder = "请选择",
  label,
  description,
  helperText,
  error,
  required = false,
  disabled = false,
  emptyText = "暂无可选项",
  className,
  triggerClassName,
  contentClassName,
}: SelectFieldProps) {
  const fieldId = useId();
  const normalizedValue = value === "" ? EMPTY_OPTION_VALUE : value;

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </label>
      ) : null}
      {description ? (
        <div className="text-xs leading-5 text-muted-foreground">{description}</div>
      ) : null}
      <Select
        value={normalizedValue}
        onValueChange={(nextValue) => onValueChange(nextValue === EMPTY_OPTION_VALUE ? "" : nextValue)}
        disabled={disabled}
      >
        <SelectTrigger id={fieldId} className={triggerClassName} aria-label={label ?? placeholder}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {options.length > 0 ? (
            options.map((option) => (
              <SelectItem
                key={`${option.value || EMPTY_OPTION_VALUE}-${option.label}`}
                value={option.value === "" ? EMPTY_OPTION_VALUE : option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))
          ) : (
            <SelectItem value="__empty__" disabled>
              {emptyText}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {error ? (
        <div className="text-xs leading-5 text-destructive">{error}</div>
      ) : helperText ? (
        <div className="text-xs leading-5 text-muted-foreground">{helperText}</div>
      ) : null}
    </div>
  );
}
