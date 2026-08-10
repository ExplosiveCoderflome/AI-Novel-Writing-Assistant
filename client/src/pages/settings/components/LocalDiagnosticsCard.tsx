import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Cpu, Server, ShieldCheck, AlertTriangle, RefreshCw, Layers } from "lucide-react";
import { getSystemDiagnostics, type DiagnosticResult } from "@/api/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LocalDiagnosticsCard() {
  const { t } = useTranslation();
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["settings", "diagnostics"],
    queryFn: getSystemDiagnostics,
    refetchOnWindowFocus: false,
  });

  const diagnostic = data?.data as DiagnosticResult | undefined;

  const renderTierInfo = (tier?: string) => {
    switch (tier) {
      case "tier1":
        return {
          label: i18next.t("settings.localDiagnosticsCard.izxcm"),
          variant: "default" as const,
          colorClass: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
          icon: <ShieldCheck className="h-5 w-5 text-emerald-600" />,
        };
      case "tier2":
        return {
          label: i18next.t("settings.localDiagnosticsCard.mkqw3q"),
          variant: "secondary" as const,
          colorClass: "text-sky-600 bg-sky-50 border-sky-200 dark:bg-sky-950/20 dark:border-sky-800",
          icon: <Layers className="h-5 w-5 text-sky-600" />,
        };
      case "tier3":
      default:
        return {
          label: i18next.t("settings.localDiagnosticsCard.b9h5xj"),
          variant: "destructive" as const,
          colorClass: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
          icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
        };
    }
  };

  const tier = renderTierInfo(diagnostic?.recommendedTier);

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            SenseNova 本地环境诊断
          </CardTitle>
          <CardDescription>{i18next.t("settings.localDiagnosticsCard.lpmx1t")}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading || isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />{i18next.t("settings.localDiagnosticsCard.karbts")}</div>
        ) : error ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            自检失败：{error instanceof Error ? error.message : "无法获取平台硬件参数"}
          </div>
        ) : diagnostic ? (
          <div className="space-y-4">
            {/* Tier Status Alert */}
            <div className={`flex items-start gap-3 rounded-md border p-3 text-sm ${tier.colorClass}`}>
              <div className="mt-0.5">{tier.icon}</div>
              <div className="space-y-1 flex-1">
                <div className="font-bold flex items-center gap-2">
                  {tier.label}
                  <Badge variant={tier.variant}>
                    {diagnostic.recommendedTier.toUpperCase()}
                  </Badge>
                </div>
                <div className="text-xs opacity-90 leading-relaxed">{diagnostic.reason}</div>
              </div>
            </div>

            {/* Detailed System Specifications */}
            <div className="grid gap-3 text-xs md:grid-cols-2">
              <div className="rounded-md border p-3 bg-muted/40 flex flex-col gap-2">
                <span className="font-bold text-muted-foreground uppercase tracking-wider">{i18next.t("settings.localDiagnosticsCard.skgse4")}</span>
                <div className="space-y-1.5 text-foreground">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{i18next.t("settings.localDiagnosticsCard.d1xjg3")}</span>
                    <span className="font-semibold">{diagnostic.platform.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CPU 处理器</span>
                    <span className="font-semibold text-right truncate max-w-[200px]" title={diagnostic.cpuModel}>
                      {diagnostic.cpuModel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{i18next.t("settings.localDiagnosticsCard.isfikh")}</span>
                    <span className="font-semibold">{diagnostic.cpuCores} 核</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{i18next.t("settings.localDiagnosticsCard.wyzj1w")}</span>
                    <span className="font-semibold">{diagnostic.totalMemoryGb} GB</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 bg-muted/40 flex flex-col gap-2">
                <span className="font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5" />{i18next.t("settings.localDiagnosticsCard.f7gwch")}</span>
                <div className="space-y-1.5 text-foreground">
                  {diagnostic.isAppleSilicon ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{i18next.t("settings.localDiagnosticsCard.b0vo6n")}</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Apple Silicon / MPS</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{i18next.t("settings.localDiagnosticsCard.6p17ar")}</span>
                        <span className="font-semibold">{diagnostic.totalMemoryGb} GB</span>
                      </div>
                    </>
                  ) : diagnostic.hasNvidiaGpu && diagnostic.gpu ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{i18next.t("settings.localDiagnosticsCard.d8vqwf")}</span>
                        <span className="font-semibold text-right truncate max-w-[200px]" title={diagnostic.gpu.name}>
                          {diagnostic.gpu.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{i18next.t("settings.localDiagnosticsCard.elb9x")}</span>
                        <span className="font-semibold">{(diagnostic.gpu.totalVramMb / 1024).toFixed(2)} GB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{i18next.t("settings.localDiagnosticsCard.g2kuj6")}</span>
                        <span className="font-semibold">{(diagnostic.gpu.freeVramMb / 1024).toFixed(2)} GB</span>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-center py-4">{i18next.t("settings.localDiagnosticsCard.sh5mz0")}<br />{i18next.t("settings.localDiagnosticsCard.a5syw8")}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/20 border rounded p-2.5 flex items-center justify-between">
              <span>{i18next.t("settings.localDiagnosticsCard.qozad9")}</span>
              <span className="font-bold text-primary">
                ≈ {diagnostic.expectedGenerationTimeSec} 秒 / 张
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
