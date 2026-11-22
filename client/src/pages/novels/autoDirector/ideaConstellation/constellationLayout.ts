import type { DirectorIdeaConstellationOption } from "@ai-novel/shared/types/novelDirector";

interface Point { x: number; y: number }
interface LabelPlacement extends Point { width: number }
export interface InspirationStar extends Point {
  option: DirectorIdeaConstellationOption;
  label?: LabelPlacement;
}

function randomForSky(ids: string) {
  let seed = 2166136261;
  for (const char of ids) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function layOutInspirationStars(options: DirectorIdeaConstellationOption[], width: number, height: number): InspirationStar[] {
  if (!options.length || width < 60 || height < 60) return [];
  const ordered = [...options].sort((a, b) => a.id.localeCompare(b.id));
  const random = randomForSky(ordered.map((item) => item.id).join("|"));
  // A roomy sky allows irregular gaps and clusters. Reserve 44px per target;
  // on a crowded sky use jittered cells when sampling cannot place them all.
  const scattered: Point[] = [];
  const separation = Math.max(48, .58 * Math.sqrt(width * height / options.length));
  for (const _option of ordered) {
    let placed = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const point = { x: 24 + random() * (width - 48), y: 24 + random() * (height - 48) };
      const fits = scattered.every(({ x, y }) => {
        const dx = Math.abs(x - point.x), dy = Math.abs(y - point.y);
        return Math.max(dx, dy) >= 44 && Math.hypot(dx, dy) >= separation;
      });
      if (!fits) continue;
      scattered.push(point);
      placed = true;
      break;
    }
    if (!placed) break;
  }
  const columns = Math.max(1, Math.min(options.length, Math.floor(width / 44),
    Math.round(Math.sqrt(options.length * width / height))));
  const rows = Math.ceil(options.length / columns);
  const cellW = width / columns;
  const cellH = height / rows;
  const slots = Array.from({ length: rows * columns }, (_, index) => index);
  for (let end = slots.length - 1; end > 0; end--) {
    const other = Math.floor(random() * (end + 1));
    [slots[end], slots[other]] = [slots[other], slots[end]];
  }
  const stars: InspirationStar[] = ordered.map((option, index) => {
    if (scattered.length === ordered.length) return { option, ...scattered[index] };
    const slot = slots[index];
    return {
      option,
      x: (slot % columns + .5) * cellW + (random() - .5) * Math.max(0, cellW - 48) * .94,
      y: (Math.floor(slot / columns) + .5) * cellH + (random() - .5) * Math.max(0, cellH - 48) * .94,
    };
  });

  // Captions occupy spare sky only. The complete text is always reachable on the star.
  const captions: LabelPlacement[] = [];
  const priority = { high: 0, medium: 1, low: 2 };
  for (const star of [...stars].sort((a, b) => priority[a.option.relevance] - priority[b.option.relevance])) {
    if (captions.length >= Math.min(14, Math.max(3, Math.floor(width * height / 32000)))) break;
    const labelWidth = Math.min(168, star.option.label.length * 14 + 4);
    const x = Math.max(labelWidth / 2 + 4, Math.min(width - labelWidth / 2 - 4, star.x));
    for (const y of [star.y + 26, star.y - 26]) {
      if (y < 13 || y > height - 13) continue;
      const nearStar = stars.some((other) => other !== star && Math.abs(x - other.x) < labelWidth / 2 + 22 && Math.abs(y - other.y) < 33);
      const nearCaption = captions.some((other) => Math.abs(x - other.x) < (labelWidth + other.width) / 2 + 8 && Math.abs(y - other.y) < 26);
      if (nearStar || nearCaption) continue;
      star.label = { x, y, width: labelWidth };
      captions.push(star.label);
      break;
    }
  }
  return stars;
}
