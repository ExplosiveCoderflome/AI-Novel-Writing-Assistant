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
    return "The main flow of the novel";
  }
  if (kind === "novel_pipeline") {
    return "Chapter Pipeline";
  }
  if (kind === "book_analysis") {
    return "Book opening task";
  }
  if (kind === "style_extraction") {
    return "Writing extraction";
  }
  return "picture task";
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
        title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        description="When the system started, it was found that a background task was interrupted before the service was restarted. Now the execution will not continue automatically. You can confirm one by one before deciding whether to resume."
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>
              deal with it later
                                </Button>
            <Button onClick={resumeAll} disabled={isResumeSinglePending || isResumeAllPending}>
              {isResumeAllPending ? "Restore all..." : "continue all"}
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
                        {item.status === "running" ? "Running interrupted" : "Queue interrupted"}
                      </Badge>
                    </div>
                    <div className="text-base font-semibold">{item.title}</div>
                    <div className="text-sm text-muted-foreground">Belonging object:{item.ownerLabel}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => resumeSingle({ kind: item.kind, id: item.id })}
                      disabled={isResumeAllPending || (isResumeSinglePending && busyTaskId !== item.id)}
                    >
                      {isResumeSinglePending && busyTaskId === item.id ? "Resume in progress..." : "Continue with single task"}
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={item.sourceRoute} onClick={closeDialog}>Open task location</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground">
                  {item.currentStage ? <div>Current stage:{item.currentStage}</div> : null}
                  {item.currentItemLabel ? <div>Interrupt location:{item.currentItemLabel}</div> : null}
                  {item.resumeAction ? <div>Recommended action:{item.resumeAction}</div> : null}
                  {item.recoveryHint ? <div>恢复建议：{item.recoveryHint}</div> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
