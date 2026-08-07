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
    return "Not created";
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
  const acknowledgementText = settings?.acknowledgementText ?? "I understand the risks of automatic release";
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
              <ShieldAlert className="h-5 w-5 text-amber-700" aria-hidden="true" />
              Automatic release pending confirmation status
                                      </CardTitle>
            <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
              After turning on, only role relationship and information awareness proposals generated after the baseline time, more than 14 days ago, and without hitting unresolved conflicts will be processed.
                                      </CardDescription>
          </div>
          <Switch
            checked={enabled}
            disabled={isLoading || isSaving}
            aria-label={enabled ? "Turn off automatic release in pending confirmation status" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
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
              <div>
                Automatic release is on. Eligible proposals will be submitted according to the official history; if they need to be rolled back, they need to be manually checked against the trace records.
                                            </div>
            </div>
          ) : null}

          <div className="grid min-w-0 gap-3 text-sm md:grid-cols-3">
            <div className="rounded-md border bg-background/80 p-3">
              <div className="text-xs text-muted-foreground">switch status</div>
              <div className="mt-1 font-medium">{enabled ? "Opening" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</div>
            </div>
            <div className="rounded-md border bg-background/80 p-3 md:col-span-2">
              <div className="text-xs text-muted-foreground">Effective base time</div>
              <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{baselineLabel}</div>
            </div>
          </div>

          <div className={`rounded-md border bg-background/70 p-3 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            Proposals that are in stock yet to be confirmed will not be included in the automatic release range. When a proposal hits an unresolved conflict, it will remain pending confirmation and wait for manual processing.
                                </div>
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
          title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
          description="This setting will submit qualified pending relationships and cognitive proposals as official historical facts."
          footer={(
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirmOpen(false);
                  resetDialog();
                }}
              >
                Cancel
                                    </Button>
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
                {isSaving ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Confirm to open"}
              </Button>
            </>
          )}
        >
          <div className="space-y-4">
            <div className={`rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              After it is turned on, the system will only process proposals generated after the effective baseline time; existing proposals that have yet to be confirmed will not enter the automatic release range. Proposals that meet the conditions will be submitted as official facts and will not be automatically revoked by the system.
                                      </div>

            <label className="flex min-w-0 items-start gap-3 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledgedRisks}
                onChange={(event) => setAcknowledgedRisks(event.target.checked)}
              />
              <span className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
                I understand that this ability automatically submits state changes for confirmation and records each action through a Director's Trace.
                                            </span>
            </label>

            <div className="space-y-2">
              <div className="text-sm font-medium">Enter confirmation text</div>
              <Input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={acknowledgementText}
              />
              <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                Please enter:{acknowledgementText}
              </div>
            </div>
          </div>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
