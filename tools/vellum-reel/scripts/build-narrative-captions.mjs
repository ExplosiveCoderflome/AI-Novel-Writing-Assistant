import {readJson, resolveArg, splitChineseText, writeJson} from './_shared.mjs';

const syncMapFile = resolveArg('sync-map', 'out/qc/voice-sync-map.json');
const outputFile = resolveArg('out', 'captions.json');
const maxChars = Number(resolveArg('max-chars', '17'));
const leadMs = Number(resolveArg('lead-ms', '260'));
const tailMs = Number(resolveArg('tail-ms', '360'));
const cardGapMs = Number(resolveArg('card-gap-ms', '70'));

const syncMap = await readJson(syncMapFile);
const captions = [];

for (const segment of syncMap.segments) {
  if (segment.id === 'opening') continue;
  const rawChunks = splitChineseText(segment.text.split('\n'), maxChars);
  const chunks = [];
  for (const chunk of rawChunks) {
    if (!/[A-Za-z0-9\u4e00-\u9fff]/u.test(chunk) && chunks.length > 0) {
      chunks[chunks.length - 1] += chunk;
    } else {
      chunks.push(chunk);
    }
  }
  const usable = segment.speechEndMs - segment.startMs - leadMs - tailMs - cardGapMs * Math.max(0, chunks.length - 1);
  if (usable <= 0 || chunks.length === 0) continue;

  const weights = chunks.map((text) => Math.max(4, [...text].length) + 2.5);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = segment.startMs + leadMs;

  chunks.forEach((text, index) => {
    const duration = (weights[index] / totalWeight) * usable;
    captions.push({
      startMs: Math.round(cursor),
      endMs: Math.round(cursor + duration),
      text,
      segmentId: segment.id,
    });
    cursor += duration + cardGapMs;
  });
}

await writeJson(outputFile, captions);
console.log(`✓ 已生成 ${captions.length} 条分段字幕：${outputFile}`);
