import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  Compass,
  Database,
  Image,
  Loader2,
  RefreshCw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { FirstNovelMilestone } from "@ai-novel/shared/types/onboarding";
import { getFirstNovelOnboarding } from "@/api/onboarding";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreationSetup } from "@/components/onboarding/CreationSetupContext";
import { cn } from "@/lib/utils";

const OPTIONAL_ICONS = {
  knowledge: Database,
  style: WandSparkles,
  image: Image,
} as const;

function MilestoneIcon({ milestone, index }: { milestone: FirstNovelMilestone; index: number }) {
  if (milestone.status === "completed") {
    return <Check className="h-4 w-4" />;
  }
  if (milestone.status === "attention") {
    return <CircleAlert className="h-4 w-4" />;
  }
  if (milestone.status === "pending") {
    return <Circle className="h-3.5 w-3.5" />;
  }
  return <span className="text-xs font-semibold">{index + 1}</span>;
}

export default function HelpPage() {
  const { openQuickSetup } = useCreationSetup();
  const journeyQuery = useQuery({
    queryKey: queryKeys.onboarding.firstNovel,
    queryFn: getFirstNovelOnboarding,
    staleTime: 15_000,
    refetchInterval: (query) => query.state.data?.data?.directorTask?.status === "running" ? 5000 : false,
  });
  const journey = journeyQuery.data?.data;

  if (journeyQuery.isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Organizing your creative route
                  </div>
    );
  }
  if (journeyQuery.isError || !journey) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 text-center">
        <CircleAlert className="h-10 w-10 text-amber-600" />
        <div>
          <h1 className="text-xl font-semibold">Creation progress cannot be read at the moment</h1>
          <p className="mt-2 text-sm text-muted-foreground">After reloading, the system will continue to recommend next steps based on model, project, and chapter status.</p>
        </div>
        <Button variant="outline" onClick={() => void journeyQuery.refetch()}><RefreshCw className="h-4 w-4" /> Reload</Button>
      </div>
    );
  }

  const primaryButton = journey.primaryAction.kind === "open_quick_setup"
    ? (
        <Button size="lg" className="w-full sm:w-auto" onClick={openQuickSetup}>
          {journey.primaryAction.label} <ArrowRight className="h-4 w-4" />
        </Button>
      )
    : (
        <Button size="lg" className="w-full sm:w-auto" asChild>
          <Link to={journey.primaryAction.route}>
            {journey.primaryAction.label} <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-[#122033] px-6 py-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.20)] sm:px-8 sm:py-9">
        <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/15 bg-white/10 text-sky-100 hover:bg-white/10">Creation Wizard</Badge>
              <Badge className="border-white/15 bg-white/10 text-slate-200 hover:bg-white/10">
                {journey.graduated ? "Chapter 1 Completed" : `Step ${Math.min(journey.completedCount + 1, journey.totalCount)} / Total ${journey.totalCount} Steps`}
              </Badge>
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">{journey.headline}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{journey.description}</p>
            <div className="mt-6 border-l border-sky-300/70 pl-4">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-sky-200">Why is this step recommended</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{journey.reason}</p>
            </div>
          </div>
          <div className="space-y-3">
            {primaryButton}
            {journey.novel ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-400">current works</div>
                <div className="mt-1 truncate font-semibold">{journey.novel.title}</div>
                <div className="mt-1 text-xs text-slate-300">{journey.novel.creationExperience === "simple" ? "Easy Creation" : "Professional Creation"}</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/15">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Compass className="h-5 w-5 text-primary" /> First book route</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">The progress comes from real models, director tasks and chapter drafts, no manual ticking is required.</p>
            </div>
            <div className="text-sm font-medium text-muted-foreground">{journey.completedCount}/{journey.totalCount} Finish</div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ol>
            {journey.milestones.map((milestone, index) => (
              <li
                key={milestone.key}
                className={cn(
                  "grid gap-3 border-b px-5 py-4 last:border-b-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-6",
                  milestone.status === "current" && "bg-primary/[0.04]",
                  milestone.status === "attention" && "bg-amber-50/70",
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border",
                  milestone.status === "completed" && "border-emerald-500 bg-emerald-500 text-white",
                  milestone.status === "current" && "border-primary bg-primary text-primary-foreground",
                  milestone.status === "attention" && "border-amber-500 bg-amber-500 text-white",
                  milestone.status === "pending" && "text-muted-foreground",
                )}>
                  <MilestoneIcon milestone={milestone} index={index} />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold">{milestone.title}</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{milestone.description}</p>
                </div>
                <div className="pl-12 text-xs sm:pl-0 sm:text-right">
                  {milestone.resultSummary ? (
                    <span className="inline-flex max-w-56 rounded-full bg-muted px-3 py-1.5 text-muted-foreground">{milestone.resultSummary}</span>
                  ) : milestone.status === "current" ? (
                    <Badge>current step</Badge>
                  ) : milestone.status === "attention" ? (
                    <Badge variant="destructive">Need to be processed</Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Optional enhancements</h2>
          <p className="mt-1 text-sm text-muted-foreground">These abilities can enhance long-term creation, but will not prevent you from completing the first chapter.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {journey.optionalEnhancements.map((item) => {
            const Icon = OPTIONAL_ICONS[item.key];
            return (
              <Link key={item.key} to={item.route} className="group rounded-2xl border bg-background p-5 transition hover:border-primary/35 hover:bg-primary/[0.025]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4 font-semibold">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {journey.graduated ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" />
            <div>
              <div className="font-semibold text-emerald-950">The novice route of the first book is completed</div>
              <p className="mt-1 text-sm leading-6 text-emerald-900/75">The wizard will retain this result, and the home page will continue to focus on the current project and next creation.</p>
            </div>
          </div>
          <Button variant="outline" asChild><Link to="/novels"><BookOpenText className="h-4 w-4" /> View all novels</Link></Button>
        </section>
      ) : (
        <section className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <div className="font-semibold">You don’t need to learn all the features first</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Just follow the only recommended actions above. World, character, chapter planning, and general quality issues are continuously handled by AI in the main chain.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
