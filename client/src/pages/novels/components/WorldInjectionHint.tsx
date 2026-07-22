import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
interface WorldInjectionHintProps {
  worldInjectionSummary: string | null;
}

export default function WorldInjectionHint({ worldInjectionSummary }: WorldInjectionHintProps) {
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
      {worldInjectionSummary ? (
        <div className="space-y-1">
          <div className="font-semibold">{t("gen.pages.novels.components.WorldInjectionHint.gen_bd8f7377")}</div>
          <pre className="whitespace-pre-wrap">{worldInjectionSummary}</pre>
        </div>
      ) : (
        <div>{t("gen.pages.novels.components.WorldInjectionHint.gen_08266721")}</div>
      )}
    </div>
  );
}
