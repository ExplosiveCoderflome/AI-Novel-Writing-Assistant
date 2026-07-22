import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import {
  CheckCircle2,
  Download,
  Layers3,
  ListVideo,
  RefreshCw,
  Sparkles,
  Video,
  Wand2,
} from "lucide-react";
import type { DramaEpisode, DramaProjectDetail, DramaShot, DramaVideoPrompt } from "@/api/drama";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type NextStepKind =
  | "source"
  | "strategy"
  | "outline"
  | "script"
  | "review"
  | "repair"
  | "storyboard"
  | "videoPrompt"
  | "providerTask"
  | "export";

interface NextStep {
  kind: NextStepKind;
  title: string;
  description: string;
  button: string;
  tab: "source" | "strategy" | "episodes" | "visual" | "export";
  icon: "source" | "strategy" | "outline" | "script" | "review" | "repair" | "video" | "export";
  episodeOrder?: number;
  shot?: DramaShot;
  videoPrompt?: DramaVideoPrompt;
}

function firstEpisodeWithoutScript(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => !episode.content?.trim());
}

function firstEpisodeWithoutReview(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) =>
    Boolean(episode.content?.trim()) && !["reviewed", "needs_repair", "approved"].includes(episode.status)
  );
}

function firstRepairableEpisode(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => episode.status === "needs_repair");
}

function firstEpisodeWithoutStoryboard(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => Boolean(episode.content?.trim()) && (episode.storyboards?.length ?? 0) === 0);
}

function firstShotWithoutVideoPrompt(episodes: DramaEpisode[], videoPrompts: DramaVideoPrompt[]): {
  episode: DramaEpisode;
  shot: DramaShot;
} | undefined {
  const promptedShotIds = new Set(videoPrompts.filter(isActiveVideoPrompt).map((prompt) => prompt.shotId).filter(Boolean));
  for (const episode of episodes) {
    for (const storyboard of episode.storyboards ?? []) {
      for (const shot of storyboard.shots ?? []) {
        if (!promptedShotIds.has(shot.id)) {
          return { episode, shot };
        }
      }
    }
  }
  return undefined;
}

function firstPromptWithoutProviderTask(videoPrompts: DramaVideoPrompt[]): DramaVideoPrompt | undefined {
  return videoPrompts.find((prompt) => isActiveVideoPrompt(prompt) && !prompt.providerTaskId);
}

function isActiveVideoPrompt(prompt: DramaVideoPrompt): boolean {
  return prompt.status !== "superseded";
}

function buildNextStep(project: DramaProjectDetail): NextStep {
  const episodes = project.episodes ?? [];
  const videoPrompts = (project.videoPrompts ?? []).filter(isActiveVideoPrompt);
  const repairable = firstRepairableEpisode(episodes);
  const unreviewed = firstEpisodeWithoutReview(episodes);
  const unscripted = firstEpisodeWithoutScript(episodes);
  const unstagedStoryboard = firstEpisodeWithoutStoryboard(episodes);
  const shotWithoutPrompt = firstShotWithoutVideoPrompt(episodes, videoPrompts);
  const promptWithoutTask = firstPromptWithoutProviderTask(videoPrompts);

  if (!project.sourceBundle) {
    return {
      kind: "source",
      title: t("gen.pages.drama.components.DramaNextStepPanel.nextStepOrganizeMaterials"),
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_b9b07305"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_eeb01df4"),
      tab: "source",
      icon: "source",
    };
  }
  if (!project.strategy) {
    return {
      kind: "strategy",
      title: t("gen.pages.drama.components.DramaNextStepPanel.nextStepGenerateDramaStrategy"),
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_cc9d0449"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_5f66b6de"),
      tab: "strategy",
      icon: "strategy",
    };
  }
  if (episodes.length === 0) {
    return {
      kind: "outline",
      title: t("gen.pages.drama.components.DramaNextStepPanel.nextStepGenerateFirst12Episodes"),
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_1a8b5635"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_ecc3b873"),
      tab: "episodes",
      icon: "outline",
    };
  }
  if (unscripted) {
    return {
      kind: "script",
      title: `下一步：生成第 ${unscripted.order} 集台本`,
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_0cb9ca78"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_7f83dc3d"),
      tab: "episodes",
      icon: "script",
      episodeOrder: unscripted.order,
    };
  }
  if (repairable) {
    return {
      kind: "repair",
      title: `下一步：修复第 ${repairable.order} 集质量问题`,
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_4e692cb2"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_98a2f9a0"),
      tab: "episodes",
      icon: "repair",
      episodeOrder: repairable.order,
    };
  }
  if (unreviewed) {
    return {
      kind: "review",
      title: `下一步：检查第 ${unreviewed.order} 集质量`,
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_9c5ff664"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_6fc8894d"),
      tab: "episodes",
      icon: "review",
      episodeOrder: unreviewed.order,
    };
  }
  if (unstagedStoryboard) {
    return {
      kind: "storyboard",
      title: `下一步：生成第 ${unstagedStoryboard.order} 集分镜`,
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_65853d35"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_3d45375e"),
      tab: "visual",
      icon: "video",
      episodeOrder: unstagedStoryboard.order,
    };
  }
  if (shotWithoutPrompt) {
    return {
      kind: "videoPrompt",
      title: `下一步：生成第 ${shotWithoutPrompt.episode.order} 集视频提示词`,
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_b644c21e"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_9bcc2e2b"),
      tab: "visual",
      icon: "video",
      episodeOrder: shotWithoutPrompt.episode.order,
      shot: shotWithoutPrompt.shot,
    };
  }
  if (promptWithoutTask) {
    return {
      kind: "providerTask",
      title: t("gen.pages.drama.components.DramaNextStepPanel.nextTaskCreateVideo"),
      description: t("gen.pages.drama.components.DramaNextStepPanel.gen_c66a6fc9"),
      button: t("gen.pages.drama.components.DramaNextStepPanel.gen_b053cdd5"),
      tab: "visual",
      icon: "video",
      videoPrompt: promptWithoutTask,
    };
  }
  return {
    kind: "export",
    title: t("gen.pages.drama.components.DramaNextStepPanel.nextStepExportInfo"),
    description: t("gen.pages.drama.components.DramaNextStepPanel.gen_8d8e1958"),
    button: t("gen.pages.drama.components.DramaNextStepPanel.gen_f33dea55"),
    tab: "export",
    icon: "export",
  };
}

function StepIcon({ icon }: { icon: NextStep["icon"] }) {
  const className = "h-4 w-4";
  if (icon === "source") return <Layers3 className={className} />;
  if (icon === "strategy") return <Sparkles className={className} />;
  if (icon === "outline") return <ListVideo className={className} />;
  if (icon === "script") return <Wand2 className={className} />;
  if (icon === "review") return <CheckCircle2 className={className} />;
  if (icon === "repair") return <RefreshCw className={className} />;
  if (icon === "video") return <Video className={className} />;
  return <Download className={className} />;
}

export function DramaNextStepPanel(props: {
  project: DramaProjectDetail;
  busy: boolean;
  onSetTab: (tab: NextStep["tab"]) => void;
  onSelectEpisode: (order: number) => void;
  onAssembleSource: () => void;
  onGenerateStrategy: () => void;
  onGenerateOutline: () => void;
  onGenerateScript: (order: number) => void;
  onReviewEpisode: (order: number) => void;
  onRepairEpisode: (order: number) => void;
  onGenerateStoryboard: (order: number) => void;
  onGenerateVideoPrompt: (shot: DramaShot) => void;
  onCreateProviderTask: (prompt: DramaVideoPrompt) => void;
  onExportMarkdown: () => void;
}) {
  const step = buildNextStep(props.project);
  const runStep = () => {
    props.onSetTab(step.tab);
    if (step.episodeOrder) {
      props.onSelectEpisode(step.episodeOrder);
    }
    if (step.kind === "source") props.onAssembleSource();
    if (step.kind === "strategy") props.onGenerateStrategy();
    if (step.kind === "outline") props.onGenerateOutline();
    if (step.kind === "script" && step.episodeOrder) props.onGenerateScript(step.episodeOrder);
    if (step.kind === "review" && step.episodeOrder) props.onReviewEpisode(step.episodeOrder);
    if (step.kind === "repair" && step.episodeOrder) props.onRepairEpisode(step.episodeOrder);
    if (step.kind === "storyboard" && step.episodeOrder) props.onGenerateStoryboard(step.episodeOrder);
    if (step.kind === "videoPrompt" && step.shot) props.onGenerateVideoPrompt(step.shot);
    if (step.kind === "providerTask" && step.videoPrompt) props.onCreateProviderTask(step.videoPrompt);
    if (step.kind === "export") props.onExportMarkdown();
  };

  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{step.title}</CardTitle>
            <Badge variant="outline">{t("gen.pages.drama.components.DramaNextStepPanel.projectTargetEpisodes")}</Badge>
          </div>
          <CardDescription>{step.description}</CardDescription>
        </div>
        <Button type="button" disabled={props.busy} onClick={runStep}>
          <StepIcon icon={step.icon} />
          {props.busy ? t("gen.pages.drama.components.DramaNextStepPanel.gen_2fb90b05") : step.button}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span>{t("gen.pages.drama.components.DramaNextStepPanel.gen_ef161d55")}</span>
        <span>{t("gen.pages.drama.components.DramaNextStepPanel.gen_9a7ad427")}</span>
        <span>{t("gen.pages.drama.components.DramaNextStepPanel.gen_4ed0720f")}</span>
        <span>{t("gen.pages.drama.components.DramaNextStepPanel.gen_68c68a2c")}</span>
      </CardContent>
    </Card>
  );
}
