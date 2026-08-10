import { useTranslation } from "react-i18next";
import i18next from "i18next";
﻿import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WritingFormulaBookStyleFlowProps {
  novelId: string;
  novelTitle?: string;
  onOpenAdvanced: () => void;
  onOpenCreate: () => void;
}

export default function WritingFormulaBookStyleFlow(props: WritingFormulaBookStyleFlowProps) {
  const { t } = useTranslation();
  const {
    novelId,
    novelTitle,
    onOpenAdvanced,
    onOpenCreate,
  } = props;
  const novelRoute = novelId ? `/novels/${novelId}/edit` : "/novels";

  return (
    <Card className="border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardHeader>
        <CardTitle>{i18next.t("dict.setBookLevelDefaultWritingStyle")}</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">{i18next.t("writingFormula.writingFormulaBookStyleFlow.11022l")}</div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-4 rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-sm font-medium text-slate-900">{i18next.t("dict.gen_5e20e280")}</div>
            <div className="rounded-2xl border bg-white p-4 text-sm leading-7 text-slate-700">
              {novelId
                ? `当前小说${novelTitle ? `《${novelTitle}》` : ""}的“默认写法”已经放到小说基础信息页里。`
                : i18next.t("dict.gen_6c23a22f")}
            </div>
            <div className="rounded-2xl border bg-slate-950 p-4 text-white">
              <div className="text-sm font-medium">{i18next.t("dict.whatEachEntranceDoes")}</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                <div>{i18next.t("dict.gen_a5c0dd79")}</div>
                <div>{i18next.t("dict.gen_f4145589")}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">{i18next.t("dict.nextStep")}</div>
            <div className="rounded-2xl border bg-slate-50/70 p-4 text-sm leading-7 text-slate-700">{i18next.t("writingFormula.writingFormulaBookStyleFlow.7u83fa")}</div>
            <div className="flex flex-wrap gap-3">
              <Button asChild type="button">
                <Link to={novelRoute}>{i18next.t("dict.gen_f0336b3a")}</Link>
              </Button>
              <Button type="button" variant="outline" onClick={onOpenAdvanced}>{i18next.t("dict.gen_94a3c6e8")}</Button>
              <Button type="button" variant="outline" onClick={onOpenCreate}>{i18next.t("writingFormula.writingFormulaBookStyleFlow.7hr003")}</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
