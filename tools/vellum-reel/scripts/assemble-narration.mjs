import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {publicPath, readJson, resolveArg, writeJson} from './_shared.mjs';

const manifestFile = resolveArg('manifest', 'narration-segments.json');
const projectFile = resolveArg('project', 'project.json');
const syncMapFile = resolveArg('sync-map', 'out/qc/voice-sync-map.json');
const manifest = await readJson(manifestFile);
const project = await readJson(projectFile);
const gapSeconds = manifest.gapMs / 1000;
const outputPath = publicPath(manifest.output);
await mkdir(path.dirname(outputPath), {recursive: true});

const durationOf = (relativePath) => {
  const probe = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', publicPath(relativePath)],
      {encoding: 'utf8'},
    ),
  );
  return Number(probe.format.duration);
};

const durations = manifest.segments.map((segment) => durationOf(segment.audio));
const args = ['-y'];
const labels = [];
let inputIndex = 0;

for (let index = 0; index < manifest.segments.length; index += 1) {
  args.push('-i', publicPath(manifest.segments[index].audio));
  labels.push(`[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${inputIndex}]`);
  inputIndex += 1;
  if (index < manifest.segments.length - 1) {
    args.push('-f', 'lavfi', '-t', String(gapSeconds), '-i', 'anullsrc=r=48000:cl=stereo');
    labels.push(`[${inputIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[a${inputIndex}]`);
    inputIndex += 1;
  }
}

const streams = Array.from({length: inputIndex}, (_, index) => `[a${index}]`).join('');
const filter = `${labels.join(';')};${streams}concat=n=${inputIndex}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=7[out]`;
args.push('-filter_complex', filter, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', outputPath);

console.log(`正在合并 ${manifest.segments.length} 段旁白并统一到 -16 LUFS…`);
execFileSync('ffmpeg', args, {stdio: 'inherit'});

const finalAudioSeconds = durationOf(manifest.output);
let cursorMs = 0;
const syncSegments = manifest.segments.map((segment, index) => {
  const startMs = Math.round(cursorMs);
  const speechEndMs = Math.round(cursorMs + durations[index] * 1000);
  const endMs =
    index === manifest.segments.length - 1
      ? Math.ceil((finalAudioSeconds * 1000 + manifest.tailMs) / 100) * 100
      : Math.round(speechEndMs + manifest.gapMs);
  cursorMs = endMs;
  return {
    id: segment.id,
    startMs,
    speechEndMs,
    endMs,
    durationMs: endMs - startMs,
    visualAnchor: segment.visualAnchor,
    text: segment.text,
    audio: segment.audio,
    image: segment.image,
  };
});
const totalMs = syncSegments.at(-1).endMs;

project.format.durationSeconds = totalMs / 1000;
project.audio.narration = manifest.output;
project.scenes = project.scenes.map((scene, index) => ({
  ...scene,
  startMs: syncSegments[index].startMs,
  endMs: syncSegments[index].endMs,
  image: syncSegments[index].image,
}));

await writeJson(projectFile, project);
await writeJson(syncMapFile, {
  generatedAt: new Date().toISOString(),
  voice: manifest.voice,
  narration: manifest.output,
  finalAudioSeconds: Number(finalAudioSeconds.toFixed(3)),
  totalVideoSeconds: totalMs / 1000,
  gapMs: manifest.gapMs,
  tailMs: manifest.tailMs,
  segments: syncSegments,
});

console.log(`最终旁白：${finalAudioSeconds.toFixed(2)}s；视频（含尾部留白）：${(totalMs / 1000).toFixed(1)}s。`);
console.log('已按每段真实音频时长更新分镜边界和 project.json。');
