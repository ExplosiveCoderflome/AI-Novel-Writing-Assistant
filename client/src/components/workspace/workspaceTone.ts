export type WorkspaceTone = "neutral" | "info" | "success" | "warning" | "danger";

export const workspaceToneSurfaceClass: Record<WorkspaceTone, string> = {
  neutral: "border-border/70 bg-muted/20",
  info: "border-info/20 bg-info/5",
  success: "border-success/20 bg-success/5",
  warning: "border-warning/25 bg-warning/5",
  danger: "border-destructive/20 bg-destructive/5",
};

export const workspaceToneTextClass: Record<WorkspaceTone, string> = {
  neutral: "text-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};
