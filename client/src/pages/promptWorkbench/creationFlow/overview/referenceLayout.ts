import { atlasScopes, type AtlasScope, type AtlasTopic } from "../atlas/atlasTopics";
import type { BookMapCover, Point } from "./bookMapLayout";

export const referenceRowHeight = 32;
export const topicHeadingHeight = 36;
const sectionHeadingHeight = 62;
const topicGap = 18;
const gutter = 16;
const toolWidth = 480;

export interface MapRect extends Point { width: number; height: number }
export interface MapTopic extends MapRect { topic: AtlasTopic }
export interface MapReferenceSection extends MapRect { scope: AtlasScope; topics: MapTopic[] }
export interface MapReferencePrompt extends MapRect { scope: string; topic: AtlasTopic; id: string; title: string }

function topicHeight(topic: AtlasTopic) {
  return topicHeadingHeight + topic.prompts.length * referenceRowHeight;
}

function placeSection(scope: AtlasScope, x: number, y: number, width: number): MapReferenceSection {
  const groups = scope.topics;
  const columns = width >= 380 ? 2 : 1;
  const columnWidth = (width - gutter * (columns - 1)) / columns;
  const topics: MapTopic[] = [];
  let bottom = sectionHeadingHeight;
  for (let i = 0; i < groups.length; i += columns) {
    const row = groups.slice(i, i + columns);
    for (const [column, topic] of row.entries()) {
      topics.push({ topic, x: column * (columnWidth + gutter), y: bottom, width: columnWidth, height: topicHeight(topic) });
    }
    bottom += Math.max(...row.map(topicHeight)) + topicGap;
  }
  return { scope, x, y, width, height: bottom - topicGap, topics };
}

export function layoutMapReferences(covers: BookMapCover[], routeBounds: MapRect, expanded: boolean) {
  const sections: MapReferenceSection[] = [];
  const prompts = new Map<string, MapReferencePrompt>();
  if (expanded) {
    for (const scope of atlasScopes) {
      const cover = covers.find(item => item.stage.id === scope.id);
      // Leave the chapter/volume return tracks above the stage references.
      const section = cover
        ? placeSection(scope, cover.x, routeBounds.y + routeBounds.height + 18, Math.max(216, cover.width))
        : placeSection(scope, routeBounds.x - toolWidth - 50, 0, toolWidth);
      sections.push(section);
      for (const group of section.topics) {
        group.topic.prompts.forEach(([id, title], i) => prompts.set(id, {
          scope: scope.id, topic: group.topic, id, title, x: section.x + group.x,
          y: section.y + group.y + topicHeadingHeight + i * referenceRowHeight, width: group.width, height: referenceRowHeight,
        }));
      }
    }
  }
  const x = Math.min(routeBounds.x, ...sections.map(s => s.x - 14));
  const right = Math.max(routeBounds.x + routeBounds.width, ...sections.map(s => s.x + s.width + 14));
  const bottom = Math.max(routeBounds.y + routeBounds.height, ...sections.map(s => s.y + s.height + 20));
  return { sections, prompts, bounds: { x, y: routeBounds.y, width: right - x, height: bottom - routeBounds.y } };
}
