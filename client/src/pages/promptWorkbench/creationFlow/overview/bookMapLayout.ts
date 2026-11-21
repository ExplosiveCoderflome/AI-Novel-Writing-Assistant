import type { FlowStage, Step } from "../flowDefinition";
import { layoutMapReferences } from "./referenceLayout";
import { layoutPromptLinks } from "./promptLinkLayout";

export const stepWidth = 184;
export const sideWidth = 169;
export const stepHeight = 50;
export const coverHeight = 136;
export const spineX = 16;
const firstY = coverHeight + 23;
const pitch = 73;
const aisle = 54;
const sideGap = 46;

export interface BookMapStation {
  step: Step;
  stage: FlowStage;
  x: number;
  y: number;
  side: boolean;
  condition?: string;
}
export interface BookMapCover { stage: FlowStage; order: number; x: number; width: number }
export type Point = { x: number; y: number };
export type Port = "top-in" | "bottom-out" | "right-out" | "right-in" | "left-out" | "left-in";
export interface BookMapLink {
  source: string;
  target: string;
  sourceHandle: Port;
  targetHandle: Port;
  kind: "main" | "handoff" | "branch" | "return";
  bends: Point[];
  label?: string;
  labelAt?: Point;
}

export function layoutBookMap(stages: FlowStage[], expanded: boolean) {
  const stations = new Map<string, BookMapStation>();
  const covers: BookMapCover[] = [];
  const links: BookMapLink[] = [];
  const sourceLevel = (station: BookMapStation) => station.y + stepHeight * 0.38;
  const targetLevel = (station: BookMapStation) => station.y + stepHeight * 0.68;
  let nextX = 0;

  // Give each stage a main track and, when requested, a parallel track for its optional steps.
  for (const [order, stage] of stages.entries()) {
    const branches = stage.branches ?? [];
    const width = stepWidth + (expanded && branches.length ? sideGap + sideWidth : 0);
    covers.push({ stage, order, x: nextX, width });
    stage.main.forEach((step, i) => {
      stations.set(step.id, { step, stage, x: nextX, y: firstY + i * pitch, side: false });
      if (i) links.push({ source: stage.main[i - 1].id, target: step.id, kind: "main", sourceHandle: "bottom-out", targetHandle: "top-in", bends: [] });
    });
    if (expanded) {
      let availableY = firstY;
      for (const branch of branches) {
        const from = stations.get(branch.from)!;
        let y = Math.max(from.y, availableY);
        branch.steps.forEach((step, i) => {
          stations.set(step.id, { step, stage, x: nextX + stepWidth + sideGap, y, side: true, condition: i === 0 ? branch.label : undefined });
          if (i) links.push({ source: branch.steps[i - 1].id, target: step.id, kind: "branch", sourceHandle: "bottom-out", targetHandle: "top-in", bends: [] });
          y += pitch;
        });
        availableY = y;
        const first = stations.get(branch.steps[0].id)!;
        const outX = nextX + stepWidth + sideGap * 0.32;
        links.push({ source: from.step.id, target: first.step.id, kind: "branch", sourceHandle: "right-out", targetHandle: "left-in",
          bends: [{ x: outX, y: sourceLevel(from) }, { x: outX, y: targetLevel(first) }] });
        if (branch.join) {
          const last = stations.get(branch.steps[branch.steps.length - 1].id)!;
          const join = stations.get(branch.join)!;
          const backX = nextX + stepWidth + sideGap * 0.72;
          links.push({ source: last.step.id, target: join.step.id, kind: "branch", sourceHandle: "left-out", targetHandle: "right-in",
            bends: [{ x: backX, y: sourceLevel(last) }, { x: backX, y: targetLevel(join) }] });
        }
      }
    }
    nextX += width + aisle;
  }

  const bottom = Math.max(...Array.from(stations.values(), s => s.y + stepHeight));
  const contentRight = nextX - aisle;
  for (let i = 1; i < covers.length; i++) {
    const previous = covers[i - 1].stage;
    const last = stations.get(previous.main[previous.main.length - 1].id)!;
    const first = stations.get(covers[i].stage.main[0].id)!;
    const lane = first.x - aisle / 2;
    const bypass = expanded && Boolean(previous.branches?.length);
    const exitY = bypass ? bottom + 18 : sourceLevel(last);
    links.push({ source: last.step.id, target: first.step.id, kind: "handoff", sourceHandle: bypass ? "bottom-out" : "right-out", targetHandle: "left-in",
      bends: [...(bypass ? [{ x: last.x + spineX, y: exitY }] : []), { x: lane, y: exitY }, { x: lane, y: targetLevel(first) }] });
  }

  // Put the chapter and volume loops below every stage; neither return line cuts across the manuscript.
  let returnCount = 0;
  for (const stage of stages) {
    for (const branch of stage.branches ?? []) {
      const last = branch.steps[branch.steps.length - 1];
      if (!last.destination) continue;
      const source = stations.get(expanded ? last.id : branch.from)!;
      const target = stations.get(last.destination)!;
      const track = bottom + 48 + returnCount * 34;
      const outside = contentRight + 18 + returnCount * 16;
      const entry = target.x - 12 - returnCount * 5;
      links.push({ source: source.step.id, target: target.step.id, kind: "return", sourceHandle: "right-out", targetHandle: "left-in",
        bends: [{ x: outside, y: sourceLevel(source) }, { x: outside, y: track }, { x: entry, y: track }, { x: entry, y: targetLevel(target) }],
        label: last.title, labelAt: { x: (entry + outside) / 2, y: track } });
      returnCount++;
    }
  }
  const routeBounds = { x: -20, y: -12, width: contentRight + 65, height: bottom + 60 + returnCount * 34 };
  const references = layoutMapReferences(covers, routeBounds, expanded);
  const visible = [...stations.values()];
  const promptLinks = layoutPromptLinks(visible, references.sections, references.prompts);
  return { covers, stations: visible, links, routeBounds, ...references, promptLinks };
}

export function promptConnectionBounds(layout: ReturnType<typeof layoutBookMap>, selected: string) {
  const links = layout.promptLinks.filter(link => link.stepId === selected || link.promptId === selected);
  if (!links.length) return;
  const stations = layout.stations.filter(s => links.some(link => link.stepId === s.step.id));
  const rows = links.map(link => layout.prompts.get(link.promptId)!);
  const boxes = [...rows, ...stations.map(s => ({ x: s.x, y: s.y, width: s.side ? sideWidth : stepWidth, height: stepHeight }))];
  const x = Math.min(...boxes.map(box => box.x), ...links.flatMap(l => [l.sourceLane, l.targetLane]));
  const y = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width), ...links.flatMap(l => [l.sourceLane, l.targetLane]));
  const bottom = Math.max(...boxes.map(box => box.y + box.height));
  return { x: x - 8, y: y - 8, width: right - x + 16, height: bottom - y + 16 };
}
