import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMPTY_VALUE = "__select_control_empty__";

type SelectChangeHandler = React.ChangeEventHandler<HTMLSelectElement>;

interface ParsedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectControlProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "onChange" | "value" | "defaultValue" | "size"> {
  value?: string | number | readonly string[] | null;
  defaultValue?: string | number | readonly string[] | null;
  onChange?: SelectChangeHandler;
  children: React.ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  placeholder?: string;
}

function normalizeValue(value: SelectControlProps["value"]): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const rawValue = Array.isArray(value) ? value[0] : value;
  const stringValue = String(rawValue ?? "");
  return stringValue === "" ? EMPTY_VALUE : stringValue;
}

function optionValue(value: unknown, fallback: React.ReactNode): string {
  if (value !== undefined && value !== null) {
    return String(value);
  }
  if (typeof fallback === "string" || typeof fallback === "number") {
    return String(fallback);
  }
  return "";
}

function collectOptions(children: React.ReactNode): ParsedOption[] {
  const options: ParsedOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      return;
    }
    if (child.type === React.Fragment) {
      const fragment = child as React.ReactElement<{ children?: React.ReactNode }>;
      options.push(...collectOptions(fragment.props.children));
      return;
    }
    if (child.type !== "option") {
      return;
    }
    const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
    options.push({
      value: optionValue(props.value, props.children),
      label: props.children,
      disabled: props.disabled,
    });
  });

  return options;
}

function emitNativeLikeChange(onChange: SelectChangeHandler | undefined, value: string) {
  if (!onChange) {
    return;
  }
  const nativeValue = value === EMPTY_VALUE ? "" : value;
  onChange({
    target: { value: nativeValue },
    currentTarget: { value: nativeValue },
  } as React.ChangeEvent<HTMLSelectElement>);
}

export default function SelectControl({
  value,
  defaultValue,
  onChange,
  children,
  className,
  triggerClassName,
  contentClassName,
  placeholder = "请选择",
  disabled,
  id,
  name,
  required,
  "aria-label": ariaLabel,
  ...props
}: SelectControlProps) {
  const options = React.useMemo(() => collectOptions(children), [children]);
  const normalizedValue = normalizeValue(value);
  const normalizedDefaultValue = normalizeValue(defaultValue);

  return (
    <Select
      value={normalizedValue}
      defaultValue={normalizedDefaultValue}
      onValueChange={(nextValue) => emitNativeLikeChange(onChange, nextValue)}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel ?? props.title ?? placeholder}
        className={cn(className, triggerClassName)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option, index) => {
          const itemValue = option.value === "" ? EMPTY_VALUE : option.value;
          return (
            <SelectItem
              key={`${itemValue}-${index}`}
              value={itemValue}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
