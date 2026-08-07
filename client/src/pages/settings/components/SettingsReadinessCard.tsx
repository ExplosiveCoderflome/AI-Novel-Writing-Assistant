import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleAlert, CircleDashed, Loader2 } from "lucide-react";
import type {
  APIKeyStatus,
  ModelRouteConnectivityResponse,
  ModelRoutesResponse,
  RagSettingsStatus,
  StyleEngineRuntimeSettingsStatus,
} from "@/api/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export type SettingsReadinessItem = {
  key: "model" | "routes" | "rag" | "style";
  title: string;
  description: string;
  state: "ready" | "warning" | "optional" | "checking";
};

function getReadinessIcon(state: SettingsReadinessItem["state"]) {
  if (state === "ready") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (state === "checking") {
    return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
  }
  if (state === "optional") {
    return <CircleDashed className="h-4 w-4 text-sky-600" />;
  }
  return <CircleAlert className="h-4 w-4 text-amber-600" />;
}

function getReadinessBadge(state: SettingsReadinessItem["state"]) {
  switch (state) {
    case "ready":
      return "Available";
    case "checking":
      return "Under inspection";
    case "optional":
      return "Optional enhancements";
    case "warning":
      return "Need to be processed";
  }
}

export function buildSettingsReadinessItems(input: {
  providers: APIKeyStatus[];
  ragSettings?: RagSettingsStatus | null;
  styleSettings?: StyleEngineRuntimeSettingsStatus | null;
  modelRoutes?: ModelRoutesResponse | null;
  modelRouteConnectivity?: ModelRouteConnectivityResponse | null;
  isModelRoutesChecking: boolean;
  isStyleSettingsLoaded: boolean;
}): SettingsReadinessItem[] {
  const {
    providers,
    ragSettings,
    styleSettings,
    modelRoutes,
    modelRouteConnectivity,
    isModelRoutesChecking,
    isStyleSettingsLoaded,
  } = input;
  const runnableProviders = providers.filter((item) => item.isConfigured && item.isActive && item.currentModel);
  const currentRagProvider = ragSettings?.providers.find((item) => item.provider === ragSettings.embeddingProvider);
  const routeStatuses = modelRouteConnectivity?.statuses ?? [];
  const failedRouteCount = routeStatuses.filter(
    (item) => (item.plain && !item.plain.ok) || (item.structured && !item.structured.ok),
  ).length;
  const hasRoutes = (modelRoutes?.routes ?? []).length > 0;
  const styleTimeout = styleSettings?.styleExtractionTimeoutMs;
  const styleReady = Boolean(styleSettings)
    && typeof styleTimeout === "number"
    && styleTimeout >= styleSettings!.minStyleExtractionTimeoutMs
    && styleTimeout <= styleSettings!.maxStyleExtractionTimeoutMs;

  return [
    {
      key: "model",
      title: "Text model",
      state: runnableProviders.length > 0 ? "ready" : "warning",
      description: runnableProviders.length > 0
        ? `已可使用 ${runnableProviders[0].name} 进行正文与规划生成。`
        : "First configure an available model, and then you can start opening the book and generating chapters.",
    },
    {
      key: "routes",
      title: "model routing",
      state: isModelRoutesChecking ? "checking" : hasRoutes && failedRouteCount === 0 ? "ready" : "warning",
      description: isModelRoutesChecking
        ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        : hasRoutes && failedRouteCount === 0
          ? "The authoring task already has available routes, and subsequent processes will select models by task."
          : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    },
    {
      key: "rag",
      title: "Knowledge base enhancement",
      state: ragSettings?.enabled && currentRagProvider?.isConfigured && currentRagProvider?.isActive ? "ready" : "optional",
      description: ragSettings?.enabled && currentRagProvider?.isConfigured && currentRagProvider?.isActive
        ? "Knowledge base search is enabled to help long-form writing keep data and settings continuous."
        : "You can start creating without configuration; enabling enhanced settings, data, and context recall.",
    },
    {
      key: "style",
      title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      state: !isStyleSettingsLoaded ? "checking" : styleReady ? "ready" : "warning",
      description: styleReady
        ? "The waiting time for writing style extraction is within the available range and can be used to learn sample writing styles."
        : "Please confirm that the waiting time for writing method extraction is within the available range.",
    },
  ];
}

export default function SettingsReadinessCard(props: {
  items: SettingsReadinessItem[];
}) {
  const { items } = props;
  const modelItem = items.find((item) => item.key === "model");
  const routesItem = items.find((item) => item.key === "routes");
  const hasModel = modelItem?.state === "ready";
  const hasHealthyRoutes = routesItem?.state === "ready";
  const blockingCount = items.filter((item) => item.key !== "rag" && item.state === "warning").length;
  const canStart = hasModel && hasHealthyRoutes && blockingCount === 0;
  const primaryAction = !hasModel
    ? { label: "Configure body model", to: "#settings-provider-section" }
    : !hasHealthyRoutes
      ? { label: "Check model routing", to: "/settings/model-routes" }
      : { label: "Start creating a novel", to: "/novels/create" };

  return (
    <Card className="min-w-0 overflow-hidden border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>Authoring availability check</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            First confirm whether the necessary models and routes to start writing novels are available; the knowledge base is an enhancement and can be added later.
                                </CardDescription>
        </div>
        <Button asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
          <Link to={primaryAction.to}>
            {primaryAction.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.key} className="min-w-0 rounded-md border bg-background/80 p-3">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {getReadinessIcon(item.state)}
                  <div className="min-w-0 font-medium">{item.title}</div>
                </div>
                <Badge variant={item.state === "ready" ? "default" : "outline"}>
                  {getReadinessBadge(item.state)}
                </Badge>
              </div>
              <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {item.description}
              </div>
            </div>
          ))}
        </div>
        <div className={`text-sm ${canStart ? "text-emerald-700" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          {canStart
            ? "Basic authoring links are available to start creating or continuing to advance a novel."
            : "It will be more stable to work on items marked as \"needs work\" first and then enter automatic director or chapter production after completion."}
        </div>
      </CardContent>
    </Card>
  );
}
