import {readJson, resolveArg, writeJson} from './_shared.mjs';

const projectFile = resolveArg('project', 'examples/narrative-demo/project.json');
const syncMapFile = resolveArg('sync-map', 'out/qc/voice-sync-map.json');
const maxShotMs = Number(resolveArg('max-shot-ms', '24000'));

const project = await readJson(projectFile);
const syncMap = await readJson(syncMapFile);
const baseScenes = new Map(project.scenes.map((scene) => [scene.id.split('--')[0], scene]));
const motions = ['push', 'pan-left', 'pan-right', 'pull', 'drift-up'];
const offsets = [[0, 0], [-6, 4], [5, -5], [-3, -7], [6, 5], [0, 8]];
const clamp = (value) => Math.max(25, Math.min(75, value));
const parseFocus = (focus) => focus.split(/\s+/).map((value) => Number(value.replace('%', '')));

const shots = [];
for (const [segmentIndex, segment] of syncMap.segments.entries()) {
  const base = baseScenes.get(segment.id);
  if (!base) throw new Error(`缺少分镜：${segment.id}`);
  const count = Math.max(1, Math.ceil(segment.durationMs / maxShotMs));
  const [baseX, baseY] = parseFocus(base.focus);

  for (let shotIndex = 0; shotIndex < count; shotIndex += 1) {
    const startMs = Math.round(segment.startMs + (segment.durationMs * shotIndex) / count);
    const endMs = Math.round(segment.startMs + (segment.durationMs * (shotIndex + 1)) / count);
    const [dx, dy] = offsets[shotIndex % offsets.length];
    shots.push({
      ...base,
      id: `${segment.id}--${shotIndex + 1}`,
      segmentId: segment.id,
      startMs,
      endMs,
      focus: `${clamp(baseX + dx)}% ${clamp(baseY + dy)}%`,
      motion: motions[(segmentIndex + shotIndex) % motions.length],
      intensity: Math.min(0.85, 0.35 + shotIndex * 0.08),
      transition: shotIndex === 0 ? 'dip' : 'crossfade',
    });
  }
}

project.scenes = shots;
await writeJson(projectFile, project);
console.log(`✓ ${syncMap.segments.length} 个叙事段扩展为 ${shots.length} 个镜头，最长约 ${maxShotMs / 1000}s。`);
