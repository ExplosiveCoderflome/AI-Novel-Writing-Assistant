import type { WorldSkeletonGenerationPayload } from "@ai-novel/shared/types/worldWizard";
import { Button } from "@/components/ui/button";

interface WorldGeneratorStepThreeProps {
  skeleton: WorldSkeletonGenerationPayload;
  savePending: boolean;
  onBackToScale: () => void;
  onSave: () => void;
}

function SectionList(props: { title: string; items: string[]; emptyText: string }) {
  const { title, items, emptyText } = props;
  return (
    <div className="rounded-md border p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 space-y-2 text-sm">
        {items.length > 0 ? items.map((item, index) => (
          <div key={`${title}-${index}`} className="rounded border bg-muted/20 p-2">
            {item}
          </div>
        )) : <div className="text-xs text-muted-foreground">{emptyText}</div>}
      </div>
    </div>
  );
}

export default function WorldGeneratorStepThree(props: WorldGeneratorStepThreeProps) {
  const { skeleton, savePending, onBackToScale, onSave } = props;
  const structure = skeleton.structuredData;
  const forceNameById = new Map(structure.forces.map((item) => [item.id, item.name]));
  const locationNameById = new Map(structure.locations.map((item) => [item.id, item.name]));

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">{skeleton.concept.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{skeleton.concept.oneSentence}</div>
          </div>
          <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
            完整度 {Math.round(skeleton.assessment.completenessScore)} / 100
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded border p-2 text-xs">
            <div className="text-muted-foreground">阅读感</div>
            <div className="mt-1 font-medium">{skeleton.concept.readerImpression}</div>
          </div>
          <div className="rounded border p-2 text-xs">
            <div className="text-muted-foreground">类型承诺</div>
            <div className="mt-1 font-medium">{skeleton.concept.genrePromise}</div>
          </div>
          <div className="rounded border p-2 text-xs">
            <div className="text-muted-foreground">可开书状态</div>
            <div className="mt-1 font-medium">{skeleton.assessment.readyForNovelUse ? "可以进入世界手册" : "建议先补齐缺口"}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionList
          title="核心规则"
          emptyText="暂无核心规则"
          items={structure.rules.axioms.map((item) =>
            [item.name, item.summary, item.cost && `代价：${item.cost}`, item.boundary && `边界：${item.boundary}`]
              .filter(Boolean)
              .join(" | "),
          )}
        />
        <SectionList
          title="主要势力"
          emptyText="暂无势力"
          items={structure.forces.map((item) =>
            [
              item.name,
              item.type,
              item.role,
              item.currentObjective && `目标：${item.currentObjective}`,
              item.pressure && `压力：${item.pressure}`,
            ].filter(Boolean).join(" | "),
          )}
        />
        <SectionList
          title="关键地点"
          emptyText="暂无地点"
          items={structure.locations.map((item) =>
            [
              item.name,
              item.type,
              item.directionHint,
              item.terrain,
              item.riskLevel ? `风险 ${item.riskLevel}` : item.risk,
              item.storyRelevance || item.narrativeFunction,
            ].filter(Boolean).join(" | "),
          )}
        />
        <SectionList
          title="势力关系"
          emptyText="暂无势力关系"
          items={structure.relations.forceRelations.map((item) =>
            [
              forceNameById.get(item.sourceForceId) ?? item.sourceForceId,
              item.relation,
              forceNameById.get(item.targetForceId) ?? item.targetForceId,
              item.tension,
              item.detail,
            ].filter(Boolean).join(" | "),
          )}
        />
        <SectionList
          title="地理关系"
          emptyText="暂无地理关系"
          items={(structure.relations.locationConnections ?? []).map((item) =>
            [
              locationNameById.get(item.sourceLocationId) ?? item.sourceLocationId,
              item.connectionType,
              locationNameById.get(item.targetLocationId) ?? item.targetLocationId,
              item.distanceHint,
              item.narrativeUse,
            ].filter(Boolean).join(" | "),
          )}
        />
        <SectionList
          title="故事入口"
          emptyText="暂无故事入口"
          items={skeleton.storyEntrySuggestions.map((item) =>
            [item.title, item.description, item.firstConflict].filter(Boolean).join(" | "),
          )}
        />
      </div>

      {skeleton.assessment.missingParts.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">完整度诊断</div>
          <div className="mt-2 space-y-1">
            {skeleton.assessment.missingParts.map((item, index) => (
              <div key={`${item.area}-${index}`}>
                {item.issue}：{item.suggestedAction}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onBackToScale}>
          返回调整规模
        </Button>
        <Button onClick={onSave} disabled={savePending}>
          {savePending ? "保存世界中..." : "保存并进入世界手册"}
        </Button>
      </div>
    </div>
  );
}
