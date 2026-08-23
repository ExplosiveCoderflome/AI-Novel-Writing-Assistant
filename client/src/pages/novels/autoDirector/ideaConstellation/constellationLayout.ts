export interface ConstellationLayoutItem {
  id: string;
  label: string;
  kind: "plot" | "foundation";
  emphasis?: "high" | "medium" | "low";
}

export interface ConstellationLayoutPoint {
  left: number;
  top: number;
  rotate: number;
}

interface PlacedRect extends ConstellationLayoutPoint {
  width: number;
  height: number;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function estimateConstellationItemSize(item: ConstellationLayoutItem): { width: number; height: number } {
  const characterCount = Array.from(item.label).length;
  if (item.kind === "foundation") {
    return { width: Math.min(210, Math.max(92, characterCount * 18 + 20)), height: 52 };
  }
  const fontSize = item.emphasis === "high" ? 18 : item.emphasis === "low" ? 12 : 14;
  const naturalWidth = Math.max(72, characterCount * fontSize + 50);
  const lineCount = Math.ceil(naturalWidth / 300);
  return {
    width: Math.min(300, naturalWidth),
    height: Math.max(42, 16 + (lineCount * Math.ceil(fontSize * 1.35))),
  };
}

function overlaps(left: PlacedRect, right: PlacedRect, gap: number): boolean {
  return Math.abs(left.left - right.left) < ((left.width + right.width) / 2) + gap
    && Math.abs(left.top - right.top) < ((left.height + right.height) / 2) + gap;
}

function intersectsCore(rect: PlacedRect, width: number, height: number): boolean {
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = Math.min(width * 0.13, 210) + (rect.width / 2);
  const radiusY = Math.min(height * 0.2, 150) + (rect.height / 2);
  const x = (rect.left - centerX) / radiusX;
  const y = (rect.top - centerY) / radiusY;
  return (x * x) + (y * y) < 1;
}

export function buildConstellationLayout(
  items: ConstellationLayoutItem[],
  width: number,
  height: number,
): Record<string, ConstellationLayoutPoint> {
  if (width <= 0 || height <= 0 || items.length === 0) return {};

  const sizeBucket = `${Math.round(width / 80)}:${Math.round(height / 60)}`;
  const random = createRandom(hashText(`${sizeBucket}|${items.map((item) => item.id).join("|")}`));
  const placed: PlacedRect[] = [];
  const result: Record<string, ConstellationLayoutPoint> = {};
  const orderedItems = [...items].sort((left, right) => {
    const leftSize = estimateConstellationItemSize(left);
    const rightSize = estimateConstellationItemSize(right);
    const areaDifference = (rightSize.width * rightSize.height) - (leftSize.width * leftSize.height);
    if (areaDifference !== 0) return areaDifference;
    return hashText(left.id) - hashText(right.id);
  });

  for (const item of orderedItems) {
    const itemSize = estimateConstellationItemSize(item);
    const halfWidth = itemSize.width / 2;
    const halfHeight = itemSize.height / 2;
    const paddingX = 22 + halfWidth;
    const paddingY = 16 + halfHeight;
    let candidate: PlacedRect | null = null;

    for (let attempt = 0; attempt < 320; attempt += 1) {
      let left: number;
      let top: number;
      left = paddingX + (random() * Math.max(1, width - (paddingX * 2)));
      top = paddingY + (random() * Math.max(1, height - (paddingY * 2)));

      const next: PlacedRect = {
        left: Math.min(width - paddingX, Math.max(paddingX, left)),
        top: Math.min(height - paddingY, Math.max(paddingY, top)),
        rotate: Math.round((random() - 0.5) * 8),
        ...itemSize,
      };
      if (intersectsCore(next, width, height)) continue;
      if (placed.some((current) => overlaps(current, next, item.kind === "foundation" ? 16 : 10))) continue;
      candidate = next;
      break;
    }

    for (let top = paddingY; !candidate && top <= height - paddingY; top += 8) {
      for (let left = paddingX; left <= width - paddingX; left += 8) {
        const next: PlacedRect = { left, top, rotate: 0, ...itemSize };
        if (intersectsCore(next, width, height)) continue;
        if (placed.some((current) => overlaps(current, next, item.kind === "foundation" ? 16 : 10))) continue;
        candidate = next;
        break;
      }
    }

    if (!candidate) {
      const angle = random() * Math.PI * 2;
      candidate = {
        left: (width / 2) + (Math.cos(angle) * Math.max(halfWidth, (width / 2) - paddingX)),
        top: (height / 2) + (Math.sin(angle) * Math.max(halfHeight, (height / 2) - paddingY)),
        rotate: Math.round((random() - 0.5) * 6),
        ...itemSize,
      };
    }

    placed.push(candidate);
    result[item.id] = {
      left: Number(((candidate.left / width) * 100).toFixed(2)),
      top: Number(((candidate.top / height) * 100).toFixed(2)),
      rotate: candidate.rotate,
    };
  }

  return result;
}
