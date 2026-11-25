export function buildDomRangeForAbsoluteOffsets(
  paragraphNodes: HTMLElement[],
  paragraphs: string[],
  from: number,
  to: number,
): Range | null {
  if (paragraphs.length === 0 || paragraphNodes.length === 0) {
    return null;
  }
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const text of paragraphs) {
    ranges.push({ start: cursor, end: cursor + text.length });
    cursor += text.length + 2;
  }

  const resolvePoint = (targetOffset: number): { node: Text; offset: number } | null => {
    const pIndex = ranges.findIndex((item) => targetOffset >= item.start && targetOffset <= item.end);
    if (pIndex < 0 || !paragraphNodes[pIndex]) {
      return null;
    }
    let remaining = targetOffset - ranges[pIndex].start;
    const walker = document.createTreeWalker(paragraphNodes[pIndex], NodeFilter.SHOW_TEXT);
    let current = walker.nextNode() as Text | null;
    let lastText: Text | null = null;
    while (current) {
      lastText = current;
      const len = current.nodeValue?.length ?? 0;
      if (remaining <= len) {
        return { node: current, offset: remaining };
      }
      remaining -= len;
      current = walker.nextNode() as Text | null;
    }
    return lastText ? { node: lastText, offset: lastText.nodeValue?.length ?? 0 } : null;
  };

  const start = resolvePoint(from);
  const end = resolvePoint(to);
  if (!start || !end) {
    return null;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}
