import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { PendingReviewAutoPromotionSettings } from "@/api/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

function formatBaseline(value: string | null | undefined): string {
  if (!value) {
    return i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.fkt6j");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function AutoDirectorPendingReviewAutoPromotionCard(props: {
  settings?: PendingReviewAutoPromotionSettings | null;
  isLoading: boolean;
  isSaving: boolean;
  onEnable: (payload: { acknowledgedRisks: boolean; confirmationText: string }) => void;
  onDisable: () => void;
}) {
  const {
    settings,
    isLoading,
    isSaving,
    onEnable,
    onDisable,
  } = props;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledgedRisks, setAcknowledgedRisks] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const enabled = Boolean(settings?.enabled);
  const acknowledgementText = settings?.acknowledgementText ?? "我已了解自动放行风险";
  const baselineLabel = useMemo(() => formatBaseline(settings?.baselineAt), [settings?.baselineAt]);
  const canConfirm = acknowledgedRisks && confirmationText.trim() === acknowledgementText && !isSaving;

  const resetDialog = () => {
    setAcknowledgedRisks(false);
    setConfirmationText("");
  };

  return (
    <>
      <Card className="min-w-0 overflow-hidden border-amber-300 bg-amber-50/35">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-700" aria-hidden="true" />{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.fz563y")}</CardTitle>
            <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.o4er4k")}</CardDescription>
          </div>
          <Switch
            checked={enabled}
            disabled={isLoading || isSaving}
            aria-label={enabled ? "关闭待确认状态自动放行" : "开启待确认状态自动放行"}
            onCheckedChange={(checked) => {
              if (checked) {
                setConfirmOpen(true);
                return;
              }
              onDisable();
            }}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {enabled ? (
            <div className={`flex min-w-0 items-start gap-2 rounded-md border border-amber-300 bg-amber-100/80 px-3 py-2 text-sm text-amber-950 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.enrrbh")}</div>
            </div>
          ) : null}

          <div className="grid min-w-0 gap-3 text-sm md:grid-cols-3">
            <div className="rounded-md border bg-background/80 p-3">
              <div className="text-xs text-muted-foreground">{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.cbufni")}</div>
              <div className="mt-1 font-medium">{enabled ? "开启中" : "关闭"}</div>
            </div>
            <div className="rounded-md border bg-background/80 p-3 md:col-span-2">
              <div className="text-xs text-muted-foreground">{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.sr16st")}</div>
              <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{baselineLabel}</div>
            </div>
          </div>

          <div className={`rounded-md border bg-background/70 p-3 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.f1l7nv")}</div>
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            resetDialog();
          }
        }}
      >
        <AppDialogContent
          title={i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.t196d9")}
          description={i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.j0hnfq")}
          footer={(
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirmOpen(false);
                  resetDialog();
                }}
              >{i18next.t("common.cancel")}</Button>
              <Button
                type="button"
                disabled={!canConfirm}
                onClick={() => {
                  onEnable({
                    acknowledgedRisks,
                    confirmationText: confirmationText.trim(),
                  });
                  setConfirmOpen(false);
                  resetDialog();
                }}
              >
                {isSaving ? "保存中..." : "确认开启"}
              </Button>
            </>
          )}
        >
          <div className="space-y-4">
            <div className={`rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.iccybj")}</div>

            <label className="flex min-w-0 items-start gap-3 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledgedRisks}
                onChange={(event) => setAcknowledgedRisks(event.target.checked)}
              />
              <span className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.7symkq")}</span>
            </label>

            <div className="space-y-2">
              <div className="text-sm font-medium">{i18next.t("settings.autoDirectorPendingReviewAutoPromotionCard.l69wib")}</div>
              <Input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={acknowledgementText}
              />
              <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                请输入：{acknowledgementText}
              </div>
            </div>
          </div>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
