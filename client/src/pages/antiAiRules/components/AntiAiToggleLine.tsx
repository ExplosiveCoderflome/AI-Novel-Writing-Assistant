import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";

interface AntiAiToggleLineProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onCheckedChange: (checked: boolean) => void;
}

export default function AntiAiToggleLine(props: AntiAiToggleLineProps) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
      <span className="min-w-0 text-muted-foreground">{props.label}</span>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        title={props.title ?? props.label}
        onCheckedChange={props.onCheckedChange}
      />
    </label>
  );
}
