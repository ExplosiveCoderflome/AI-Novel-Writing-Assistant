import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {readJson, resolveArg, root, writeJson} from './_shared.mjs';

const input = process.argv[2] ?? 'out/book-video.mp4';
const absoluteInput = path.resolve(root, input);
const qcDir = path.resolve(root, resolveArg('qc-dir', 'out/qc'));
const project = await readJson(resolveArg('project', 'project.json'));
await mkdir(qcDir, {recursive: true});

const probe = JSON.parse(
  execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=index,codec_type,codec_name,width,height,sample_rate,channels',
    '-of',
    'json',
    absoluteInput,
  ], {encoding: 'utf8'}),
);
const video = probe.streams.find((stream) => stream.codec_type === 'video');
const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
const duration = Number(probe.format.duration);
const interval = Math.max(1, duration / 6);
const contactSheet = path.join(qcDir, 'contact-sheet.jpg');

execFileSync('ffmpeg', [
  '-y',
  '-i',
  absoluteInput,
  '-vf',
  `fps=1/${interval},scale=270:-1,tile=3x2:padding=8:margin=8:color=111111`,
  '-frames:v',
  '1',
  contactSheet,
], {stdio: 'ignore'});

const report = {
  generatedAt: new Date().toISOString(),
  input,
  expected: {
    durationSeconds: project.format.durationSeconds,
    aspectRatio: '9:16',
  },
  actual: {
    durationSeconds: Number(duration.toFixed(3)),
    sizeBytes: Number(probe.format.size),
    video: video
      ? {codec: video.codec_name, width: video.width, height: video.height}
      : null,
    audio: audio
      ? {codec: audio.codec_name, sampleRate: Number(audio.sample_rate), channels: audio.channels}
      : null,
  },
  checks: {
    durationMatches: Math.abs(duration - project.format.durationSeconds) < 0.2,
    isVertical916: Boolean(video && video.width / video.height === 9 / 16),
    isH264: video?.codec_name === 'h264',
  },
  contactSheet,
};
await writeJson(path.join(path.relative(root, qcDir), 'report.json'), report);

console.log(`成片：${input}`);
console.log(`时长：${duration.toFixed(2)}s`);
console.log(`视频：${video?.codec_name ?? '无'} ${video?.width ?? '?'}x${video?.height ?? '?'}`);
console.log(`音频：${audio ? `${audio.codec_name} ${audio.sample_rate ?? '?'}Hz ${audio.channels ?? '?'}ch` : '无音轨'}`);
console.log(`抽帧联系表：${contactSheet}`);
console.log(`机器可读验片报告：${path.join(qcDir, 'report.json')}`);

if (Object.values(report.checks).some((passed) => !passed)) {
  console.error('验片失败：时长、画幅或编码与项目要求不一致。');
  process.exit(1);
}
