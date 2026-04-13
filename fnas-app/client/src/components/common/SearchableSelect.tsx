import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label?: string;
  keywords?: string[];
  disabled?: boolean;
}

interface SearchableSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  allowCustomValue?: boolean;
  onCustomValue?: (value: string) => void;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export default function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "请选择",
  searchPlaceholder = "搜索",
  emptyText = "没有可选项",
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
  allowCustomValue = false,
  onCustomValue,
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return options;
    }
    return options.filter((option) => {
      const haystack = [
        option.label ?? option.value,
        option.value,
        ...(option.keywords ?? []),
      ].map(normalizeText);
      return haystack.some((item) => item.includes(normalizedQuery));
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const displayLabel = selectedOption?.label ?? selectedOption?.value ?? value ?? "";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          triggerClassName,
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={cn("truncate text-left", !displayLabel && "text-muted-foreground")}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
            contentClassName,
          )}
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                placeholder={searchPlaceholder}
                className="h-8 pl-8"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    const firstAvailable = filteredOptions.find((option) => !option.disabled);
                    if (firstAvailable) {
                      onValueChange(firstAvailable.value);
                      setOpen(false);
                    } else if (allowCustomValue && query.trim()) {
                      const customValue = query.trim();
                      onValueChange(customValue);
                      if (onCustomValue) {
                        onCustomValue(customValue);
                      }
                      setOpen(false);
                    }
                  }
                }}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
                      option.disabled
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-accent text-accent-foreground",
                    )}
                    onClick={() => {
                      if (option.disabled) {
                        return;
                      }
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate pr-3">{option.label ?? option.value}</span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            ) : allowCustomValue && query.trim() ? (
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  const customValue = query.trim();
                  onValueChange(customValue);
                  if (onCustomValue) {
                    onCustomValue(customValue);
                  }
                  setOpen(false);
                }}
              >
                <span className="truncate pr-3">使用自定义值: {query.trim()}</span>
              </button>
            ) : (
              <div className="px-2 py-3 text-sm text-muted-foreground">{emptyText}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
