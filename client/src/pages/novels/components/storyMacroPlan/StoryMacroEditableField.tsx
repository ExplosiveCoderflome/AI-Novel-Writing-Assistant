import { useId, useState, type ReactNode } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { textareaClassName } from "../StoryMacroPlanTab.shared";

interface StoryMacroEditableFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  actions?: ReactNode;
  list?: boolean;
  className?: string;
}

export default function StoryMacroEditableField({
  label, value, placeholder, onChange, actions, list = false, className,
}: StoryMacroEditableFieldProps) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  // Keep the raw text while typing: list normalization must not eat newlines.
  const [draft, setDraft] = useState(value);
  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };
  const items = list ? value.split(/\r?\n/).filter((item) => item.trim()) : [];

  return (
    <div
      className={cn("min-w-0 space-y-2", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setEditing(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <label htmlFor={editing ? inputId : undefined} className="text-sm font-medium text-foreground">
            {label}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label={`${editing ? "完成编辑" : "编辑"}${label}`}
            title={editing ? "完成编辑，返回阅读" : "编辑内容"}
            onClick={() => editing ? setEditing(false) : startEditing()}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {actions ? <div onClick={() => setEditing(false)}>{actions}</div> : null}
      </div>
      {editing ? (
        <textarea
          id={inputId}
          autoFocus
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
              event.preventDefault();
              setEditing(false);
            }
          }}
          placeholder={placeholder}
          className={cn(textareaClassName("min-h-28"), "leading-7")}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={`编辑${label}`}
          onClick={startEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              startEditing();
            }
          }}
          className={cn(
            "cursor-text rounded-md px-1 py-2 text-sm leading-7 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !value.trim() && "text-muted-foreground",
          )}
        >
          {items.length > 0 ? (
            <ul className="list-disc space-y-2 pl-5">
              {items.map((item, index) => <li key={index} className="whitespace-pre-wrap break-words">{item}</li>)}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap break-words">{value.trim() ? value : `${placeholder} 点击补充。`}</p>
          )}
        </div>
      )}
    </div>
  );
}
