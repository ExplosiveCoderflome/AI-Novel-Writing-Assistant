import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import { LockKeyhole, PencilRuler, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  analyzeTensionCurveShape,
  buildReferenceCurveValues,
  tensionCurveReferenceTemplates,
} from "./tensionCurveAnalysis";
import { chartWidth } from "./curveCoordinates";
import { TensionCurveFlowCanvas } from "./TensionCurveFlowCanvas";
import { CompactLegend } from "./TensionCurveNodes";
import type {
  TensionCurveSeries,
  TensionCurveViewportOption,
} from "./tensionCurveTypes";

export type {
  TensionCurvePoint,
  TensionCurveSeries,
  TensionCurveViewportOption,
} from "./tensionCurveTypes";

interface TensionCurvePanelProps {
  title: string;
  subtitle?: string;
  series: TensionCurveSeries[];
  viewportOptions?: TensionCurveViewportOption[];
  selectedViewportKey?: string;
  onViewportChange?: (key: string) => void;
  readonly?: boolean;
  compact?: boolean;
  onRequestEdit?: () => void;
}

export default function TensionCurvePanel(props: TensionCurvePanelProps) {
  const {
    title,
    subtitle,
    series,
    viewportOptions = [],
    selectedViewportKey = "all",
    onViewportChange,
    compact = false,
    onRequestEdit,
  } = props;
  const [showReferenceCurve, setShowReferenceCurve] = useState(false);
  const [referenceTemplateKey, setReferenceTemplateKey] = useState(tensionCurveReferenceTemplates[0]?.key ?? "escalation");

  const primaryPoints = series[0]?.points ?? [];
  const primaryPointCount = primaryPoints.length;
  const canvasWidth = chartWidth(primaryPointCount);
  const userAnchorCount = primaryPoints.filter((point) => point.source === "user").length;
  const shapeHints = useMemo(() => analyzeTensionCurveShape(primaryPoints), [primaryPoints]);
  const referenceTemplate = tensionCurveReferenceTemplates.find((template) => template.key === referenceTemplateKey)
    ?? tensionCurveReferenceTemplates[0];
  const referenceValues = useMemo(
    () => referenceTemplate ? buildReferenceCurveValues(referenceTemplate, primaryPointCount) : [],
    [primaryPointCount, referenceTemplate],
  );

  return (
    <Card className={cn("border-border/70 bg-background/95", compact ? "rounded-lg" : "rounded-xl")}>
      <CardHeader className={cn("pb-3", compact ? "space-y-2" : "space-y-3")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className={cn("leading-none", compact ? "text-sm" : "text-base")}>{title}</CardTitle>
              <Badge variant="outline">{t("gen.components.tensionCurve.TensionCurvePanel.gen_85541bd9")}</Badge>
              {userAnchorCount > 0 ? <Badge variant="secondary">{t("gen.components.tensionCurve.TensionCurvePanel.gen_26e6c369")}</Badge> : null}
            </div>
            {subtitle ? <div className="text-xs leading-5 text-muted-foreground">{subtitle}</div> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {viewportOptions.map((option) => (
              <Button
                key={option.key}
                type="button"
                size="sm"
                variant={selectedViewportKey === option.key ? "secondary" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => onViewportChange?.(option.key)}
              >
                {option.key === "all" ? <SlidersHorizontal className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : null}
                {option.label}
              </Button>
            ))}
            {onRequestEdit ? (
              <Button type="button" size="sm" className="h-8 px-2 text-xs" onClick={onRequestEdit}>
                <PencilRuler className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                编辑紧张度曲线
              </Button>
            ) : null}
            {primaryPointCount > 1 ? (
              <div className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1">
                <span className="text-xs text-muted-foreground">{t("gen.components.tensionCurve.TensionCurvePanel.gen_78e6e8fc")}</span>
                <Switch
                  checked={showReferenceCurve}
                  onCheckedChange={setShowReferenceCurve}
                  aria-label={t("gen.components.tensionCurve.TensionCurvePanel.gen_fbd9193d")}
                  className="h-5 w-9"
                />
                {showReferenceCurve ? (
                  <Select value={referenceTemplateKey} onValueChange={setReferenceTemplateKey}>
                    <SelectTrigger className="h-8 w-[92px] rounded-md px-2 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tensionCurveReferenceTemplates.map((template) => (
                        <SelectItem key={template.key} value={template.key}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <TensionCurveFlowCanvas
          series={series}
          selectedViewportKey={selectedViewportKey}
          compact={compact}
          readonly
          showReferenceCurve={showReferenceCurve}
          referenceValues={referenceValues}
        />

        {!compact && canvasWidth > 900 ? (
          <div className="text-xs text-muted-foreground">{t("gen.components.tensionCurve.TensionCurvePanel.gen_a17e13a9")}</div>
        ) : null}

        {!compact ? <CompactLegend /> : null}

        {shapeHints.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-3">
            {shapeHints.map((hint) => (
              <div key={hint.key} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="font-medium">{hint.label}</div>
                <div className="mt-1 leading-5">{hint.detail}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
            当前视图只用于查看，不会改动草稿
          </span>
          {showReferenceCurve && referenceTemplate ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-px w-5 border-t border-dashed border-slate-500" />
              {referenceTemplate.label}参考
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
