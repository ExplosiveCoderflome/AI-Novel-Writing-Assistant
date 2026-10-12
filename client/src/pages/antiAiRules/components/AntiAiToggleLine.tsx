import { Switch } from "@/components/ui/switch";

interface AntiAiToggleLineProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onCheckedChange: (checked: boolean) => void;
}

export default function AntiAiToggleLine(props: AntiAiToggleLineProps) {
  return (
    <label className="flex min-h-9 items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        aria-label={props.title ?? props.label}
        title={props.title ?? props.label}
        onCheckedChange={props.onCheckedChange}
      />
    </label>
  );
}
