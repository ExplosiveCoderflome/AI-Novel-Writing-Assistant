import { relationsFor } from "../atlas/stepPromptRelations";

export function PromptConnections({ id, open }: { id: string; open: (id: string) => void }) {
  const links = relationsFor(id);
  if (!links.length) return null;
  const fromStep = links[0].stepId === id;
  return <dl className="map-reader-connections" aria-label="图中连线">
    {(["uses", "companion"] as const).map(kind => {
      const group = links.filter(link => link.kind === kind);
      if (!group.length) return null;
      const label = fromStep ? (kind === "uses" ? "本步使用" : "配套工具") : (kind === "uses" ? "使用步骤" : "配合步骤");
      return <div key={kind} data-kind={kind}><dt>{label}</dt><dd>
        {group.map(link => <button key={link.stepId + link.promptId} type="button" onClick={() => open(fromStep ? link.promptId : link.stepId)}>
          {fromStep ? link.promptTitle : link.stepTitle}</button>)}
      </dd></div>;
    })}
  </dl>;
}
