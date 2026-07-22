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
    return t("gen.components.layout.TaskRecoveryDialog.gen_398df545");
  }
  if (kind === "novel_pipeline") {
    return t("gen.components.layout.TaskRecoveryDialog.gen_30261b85");
  }
  if (kind === "book_analysis") {
    return t("gen.components.layout.TaskRecoveryDialog.gen_fc2be1f8");
  }
  if (kind === "style_extraction") {
    return t("gen.components.layout.TaskRecoveryDialog.gen_f94905b4");
  }
  return t("gen.components.layout.TaskRecoveryDialog.gen_8cf8ad31");
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
        title={t("gen.components.layout.TaskRecoveryDialog.gen_875de71e")}
        description={t("gen.components.layout.TaskRecoveryDialog.gen_5f4f5676")}
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>
              稍后处理
            </Button>
            <Button onClick={resumeAll} disabled={isResumeSinglePending || isResumeAllPending}>
              {isResumeAllPending ? t("gen.components.layout.TaskRecoveryDialog.gen_e4f9620b") : t("gen.components.layout.TaskRecoveryDialog.gen_7e47d5e6")}
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
                        {item.status === "running" ? t("gen.components.layout.TaskRecoveryDialog.gen_d8a255ce") : t("gen.components.layout.TaskRecoveryDialog.gen_e8a5ba34")}
                      </Badge>
                    </div>
                    <div className="text-base font-semibold">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{t("gen.components.layout.TaskRecoveryDialog.gen_7e73a71c")}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => resumeSingle({ kind: item.kind, id: item.id })}
                      disabled={isResumeAllPending || (isResumeSinglePending && busyTaskId !== item.id)}
                    >
                      {isResumeSinglePending && busyTaskId === item.id ? t("gen.components.layout.TaskRecoveryDialog.gen_3baa9427") : t("gen.components.layout.TaskRecoveryDialog.gen_02737149")}
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={item.sourceRoute} onClick={closeDialog}>{t("gen.components.layout.TaskRecoveryDialog.gen_f103497a")}</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground">
                  {item.currentStage ? <div>{t("gen.components.layout.TaskRecoveryDialog.gen_6e352de9")}</div> : null}
                  {item.currentItemLabel ? <div>{t("gen.components.layout.TaskRecoveryDialog.interruptPosition")}</div> : null}
                  {item.resumeAction ? <div>{t("gen.components.layout.TaskRecoveryDialog.gen_fbf1c98b")}</div> : null}
                  {item.recoveryHint ? <div>{t("gen.components.layout.TaskRecoveryDialog.gen_c0399962")}</div> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
