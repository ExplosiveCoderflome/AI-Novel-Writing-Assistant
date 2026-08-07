import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OutlineTabViewProps } from "../NovelEditView.types";

type OutlineCharacterResource = NonNullable<OutlineTabViewProps["characterResources"]>[number];

function getResourceStatusLabel(status: OutlineCharacterResource["status"]): string {
  const labels: Record<OutlineCharacterResource["status"], string> = {
    available: "Available",
    hidden: "hide",
    borrowed: "borrow",
    transferred: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    lost: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    consumed: "Consumed",
    damaged: "damaged",
    destroyed: "destruction",
    stale: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  };
  return labels[status] ?? status;
}

function getVolumeResourceWindow(resource: OutlineCharacterResource): string {
  if (resource.expectedUseStartChapterOrder || resource.expectedUseEndChapterOrder) {
    return `预计第${resource.expectedUseStartChapterOrder ?? "?"}章至第${resource.expectedUseEndChapterOrder ?? "?"}章使用`;
  }
  if (resource.lastTouchedChapterOrder) {
    return `最近触达第${resource.lastTouchedChapterOrder}章`;
  }
  return "Please refer to subsequent chapters";
}

function isResourceRelevantToVolume(
  resource: OutlineCharacterResource,
  selectedVolume: OutlineTabViewProps["volumes"][number] | undefined,
): boolean {
  if (!selectedVolume || selectedVolume.chapters.length === 0) {
    return resource.expectedUseEndChapterOrder != null
      || resource.narrativeFunction === "promise"
      || resource.narrativeFunction === "hidden_card";
  }
  const orders = selectedVolume.chapters.map((chapter) => chapter.chapterOrder);
  const start = Math.min(...orders);
  const end = Math.max(...orders);
  const resourceStart = resource.expectedUseStartChapterOrder ?? resource.lastTouchedChapterOrder ?? start;
  const resourceEnd = resource.expectedUseEndChapterOrder ?? resourceStart;
  const overlapsVolume = resourceStart <= end && resourceEnd >= start;
  return overlapsVolume
    || resource.narrativeFunction === "promise"
    || resource.narrativeFunction === "hidden_card";
}

export default function OutlineResourceCommitments(props: {
  selectedVolume: OutlineTabViewProps["volumes"][number] | undefined;
  resources: OutlineCharacterResource[];
}) {
  const relevantResources = props.resources
    .filter((resource) => isResourceRelevantToVolume(resource, props.selectedVolume))
    .slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Key resource commitments for this volume</CardTitle>
        <div className="text-sm text-muted-foreground">
          Only resources that will affect the action boundary, foreshadowing, or subsequent fulfillment of this volume are displayed.
                          </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {relevantResources.length > 0 ? (
          relevantResources.map((resource) => (
            <div key={resource.id} className="rounded-xl border border-border/70 bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 text-sm font-medium text-foreground">{resource.name}</div>
                <Badge variant={resource.status === "available" || resource.status === "borrowed" ? "outline" : "secondary"}>
                  {getResourceStatusLabel(resource.status)}
                </Badge>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{resource.summary}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {resource.holderCharacterName ? <Badge variant="outline">{resource.holderCharacterName}</Badge> : null}
                <Badge variant="outline">{getVolumeResourceWindow(resource)}</Badge>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            There are no character resource commitments on the current roll that require special attention.
                                    </div>
        )}
      </CardContent>
    </Card>
  );
}
