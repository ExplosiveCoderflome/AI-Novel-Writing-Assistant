import { useQuery } from "@tanstack/react-query";
import { ArrowRight, KeyRound } from "lucide-react";
import { getQuickSetupStatus } from "@/api/onboarding";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { useCreationSetup } from "./CreationSetupContext";

export default function CreationSetupNotice() {
  const { openQuickSetup } = useCreationSetup();
  const statusQuery = useQuery({
    queryKey: queryKeys.settings.quickSetup,
    queryFn: getQuickSetupStatus,
    staleTime: 60_000,
  });
  const status = statusQuery.data?.data;
  if (statusQuery.isPending || statusQuery.isError || status?.readyForCreation) {
    return null;
  }
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-amber-300 bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-amber-950">After completing the quick configuration, you can start AI creation</div>
          <p className="mt-1 text-sm leading-6 text-amber-900/80">
            {status?.blockingReasons[0] ?? "Select a text model, and the system will automatically prepare the task routes required for planning, body text, proofreading, and repair."}
          </p>
        </div>
      </div>
      <Button className="shrink-0" onClick={openQuickSetup}>
        Quick configuration <ArrowRight className="h-4 w-4" />
      </Button>
    </section>
  );
}
