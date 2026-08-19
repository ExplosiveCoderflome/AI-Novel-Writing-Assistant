import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { RecoverableTaskSummary } from "@ai-novel/shared/types/task";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useTaskRecovery } from "./TaskRecoveryContext";

function formatTaskKind(kind: RecoverableTaskSummary["kind"]): string {
  if (kind === "novel_workflow") {
    return i18next.t("dict.gen_398df545");
  }
  if (kind === "novel_pipeline") {
    return i18next.t("dict.gen_30261b85");
  }
  if (kind === "book_analysis") {
    return i18next.t("dict.gen_fc2be1f8");
  }
  if (kind === "style_extraction") {
    return i18next.t("tasks.filterKindStyleExtraction");
  }
  return i18next.t("dict.gen_8cf8ad31");
}

export default function TaskRecoveryDialog() {
  const {
    items,
    isOpen,
    busyTaskId,
    isResumeSinglePending,
    isResumeAllPending,
    closeDialog,
    resumeSingle,
    resumeAll,
  } = useTaskRecovery();

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
      <AppDialogContent
        title={i18next.t("dict.gen_875de71e")}
        description={i18next.t("dict.gen_5f4f5676")}
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>{i18next.t("layout.taskRecoveryDialog.fqxp0j")}</Button>
            <Button onClick={resumeAll} disabled={isResumeSinglePending || isResumeAllPending}>
              {isResumeAllPending ? i18next.t("dict.gen_e4f9620b") : i18next.t("dict.gen_7e47d5e6")}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={`${item.kind}-${item.id}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{formatTaskKind(item.kind)}</Badge>
                      <Badge variant={item.status === "running" ? "default" : "secondary"}>
                        {item.status === "running" ? i18next.t("dict.gen_d8a255ce") : i18next.t("dict.gen_e8a5ba34")}
                      </Badge>
                    </div>
                    <div className="text-base font-semibold">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_7e73a71c")}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => resumeSingle({ kind: item.kind, id: item.id })}
                      disabled={isResumeAllPending || (isResumeSinglePending && busyTaskId !== item.id)}
                    >
                      {isResumeSinglePending && busyTaskId === item.id ? i18next.t("dict.gen_3baa9427") : i18next.t("dict.gen_02737149")}
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={item.sourceRoute} onClick={closeDialog}>{i18next.t("dict.gen_f103497a")}</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground">
                  {item.currentStage ? <div>{i18next.t("dict.gen_6e352de9")}</div> : null}
                  {item.currentItemLabel ? <div>{i18next.t("dict.interruptPosition")}</div> : null}
                  {item.resumeAction ? <div>{i18next.t("dict.gen_fbf1c98b")}</div> : null}
                  {item.recoveryHint ? <div>{i18next.t("dict.gen_c0399962")}</div> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
