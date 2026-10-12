import { lazy, Suspense } from "react";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

const ModelProviderSettings = lazy(() => import("../SettingsPage"));

export function ModelSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="模型与厂商"
        description="管理创作使用的模型厂商、连接信息和可用模型。"
        className="max-w-5xl"
        bodyClassName="min-h-[min(32rem,65dvh)] p-4 sm:p-6"
      >
        <Suspense fallback={<div role="status" className="py-8 text-sm text-muted-foreground">正在加载模型配置…</div>}>
          {open ? <ModelProviderSettings embedded /> : null}
        </Suspense>
      </AppDialogContent>
    </Dialog>
  );
}
