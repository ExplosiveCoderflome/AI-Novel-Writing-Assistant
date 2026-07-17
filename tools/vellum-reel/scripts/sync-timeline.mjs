import {execFileSync} from 'node:child_process';
import {publicPath, readJson, resolveArg, writeJson} from './_shared.mjs';
import {syncProjectTimeline} from './timeline.mjs';

const projectFile = resolveArg('project', 'project.json');
const captionsFile = resolveArg('captions', 'captions.json');
const tailMs = Number(resolveArg('tail-ms', '900'));
const project = await readJson(projectFile);
const captions = await readJson(captionsFile);
const audioRelative = resolveArg('audio', project.audio.narration);

if (!audioRelative) {
  throw new Error('无法同步时间轴：project.audio.narration 为空。');
}

const probe = JSON.parse(
  execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', publicPath(audioRelative)],
    {encoding: 'utf8'},
  ),
);
const audioMs = Number(probe.format.duration) * 1000;
if (!Number.isFinite(audioMs) || audioMs <= 0) throw new Error('无法读取旁白音频时长。');

const synced = syncProjectTimeline({project, captions, audioMs, tailMs});

await writeJson(projectFile, synced.project);
console.log(`时间轴已同步：${(synced.oldTotalMs / 1000).toFixed(1)}s → ${(synced.targetMs / 1000).toFixed(1)}s`);
console.log(`旁白 ${(audioMs / 1000).toFixed(2)}s，尾部留白 ${(tailMs / 1000).toFixed(2)}s，分镜已按原比例缩放。`);
