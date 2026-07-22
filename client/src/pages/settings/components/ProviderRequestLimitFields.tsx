import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Input } from "@/components/ui/input";

interface ProviderRequestLimitFieldsProps {
  concurrencyLimit: string;
  requestIntervalMs: string;
  onChange: (value: {
    concurrencyLimit?: string;
    requestIntervalMs?: string;
  }) => void;
}

export default function ProviderRequestLimitFields({
  concurrencyLimit,
  requestIntervalMs,
  onChange,
}: ProviderRequestLimitFieldsProps) {
  return (
    <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{t("gen.pages.settings.components.ProviderRequestLimitFields.gen_06d67b60")}</div>
        <Input
          type="number"
          min={0}
          step={1}
          value={concurrencyLimit}
          placeholder="0"
          onChange={(event) => onChange({ concurrencyLimit: event.target.value })}
        />
        <div className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
          0 表示不限制。同一供应商和模型的请求超过上限时会排队执行。
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{t("gen.pages.settings.components.ProviderRequestLimitFields.gen_16f55bcd")}</div>
        <Input
          type="number"
          min={0}
          step={100}
          value={requestIntervalMs}
          placeholder="0"
          onChange={(event) => onChange({ requestIntervalMs: event.target.value })}
        />
        <div className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
          0 表示不限制。用于控制同一供应商和模型的连续发起速度。
        </div>
      </div>
    </div>
  );
}

export function ProviderRequestLimitSummary({
  concurrencyLimit,
  requestIntervalMs,
}: {
  concurrencyLimit: number;
  requestIntervalMs: number;
}) {
  return (
    <div className="mb-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
      请求限制：并发 {concurrencyLimit || t("gen.pages.settings.components.ProviderRequestLimitFields.unlimited")} · 间隔 {requestIntervalMs ? `${requestIntervalMs}ms` : t("gen.pages.settings.components.ProviderRequestLimitFields.unlimited")}
    </div>
  );
}
