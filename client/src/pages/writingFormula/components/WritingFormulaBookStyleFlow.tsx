import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
        <CardTitle>{t("gen.pages.writingFormula.components.WritingFormulaBookStyleFlow.setBookLevelDefaultWritingStyle")}</CardTitle>
        <div className="text-sm leading-7 text-muted-foreground">
          写法引擎负责创建、测试和整理写法资产。当前小说要使用哪套默认写法，请回到小说基础信息里确认，再带入后续导演和正文流程。
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-4 rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaBookStyleFlow.gen_5e20e280")}</div>
            <div className="rounded-2xl border bg-white p-4 text-sm leading-7 text-slate-700">
              {novelId
                ? `当前小说${novelTitle ? `《${novelTitle}》` : ""}的“默认写法”已经放到小说基础信息页里。`
                : t("gen.pages.writingFormula.components.WritingFormulaBookStyleFlow.gen_6c23a22f")}
            </div>
            <div className="rounded-2xl border bg-slate-950 p-4 text-white">
              <div className="text-sm font-medium">{t("gen.pages.writingFormula.components.WritingFormulaBookStyleFlow.whatEachEntranceDoes")}</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                <div>{t("gen.pages.writingFormula.components.WritingFormulaBookStyleFlow.gen_a5c0dd79")}</div>
                <div>{t("gen.pages.writingFormula.components.WritingFormulaBookStyleFlow.gen_f4145589")}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-slate-900">{t("gen.pages.writingFormula.components.WritingFormulaBookStyleFlow.nextStep")}</div>
            <div className="rounded-2xl border bg-slate-50/70 p-4 text-sm leading-7 text-slate-700">
              先去小说页确认这本书的默认写法。如果当前资产库里还没有合适的写法，再回到写法引擎创建或整理资产。
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild type="button">
                <Link to={novelRoute}>{t("gen.pages.writingFormula.components.WritingFormulaBookStyleFlow.gen_f0336b3a")}</Link>
              </Button>
              <Button type="button" variant="outline" onClick={onOpenAdvanced}>
                编辑当前写法
              </Button>
              <Button type="button" variant="outline" onClick={onOpenCreate}>
                新建一套写法
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
