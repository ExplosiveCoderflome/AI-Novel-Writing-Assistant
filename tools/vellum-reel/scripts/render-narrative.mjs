import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {readJson, resolveArg, root} from './_shared.mjs';

const narrativeDir = resolveArg('narrative', 'examples/narrative-demo');
const mode = resolveArg('mode', 'quick');
if (!['quick', 'final'].includes(mode)) throw new Error('--mode 只能是 quick 或 final');

const projectFile = path.join(narrativeDir, 'project.json');
const captionsFile = path.join(narrativeDir, 'captions.json');
const project = await readJson(projectFile);
const captions = await readJson(captionsFile);
if (mode === 'final' && !project.audio?.narration) {
  throw new Error('正式渲染需要旁白。请配置 project.audio.narration，或先使用 --mode=quick 检查视觉。');
}
const slug = project.id;
const output = path.join('out', slug, mode === 'final' ? 'narrative-full.mp4' : 'narrative-preview.mp4');
const qcDir = path.join('out', slug, 'qc', mode);

execFileSync('node', ['scripts/validate-project.mjs', `--project=${projectFile}`, `--captions=${captionsFile}`], {stdio: 'inherit'});
execFileSync('npx', [
  'remotion', 'render', 'src/index.ts', 'NarrativeVideo', output,
  '--codec=h264',
  mode === 'final' ? '--crf=19' : '--crf=25',
  ...(mode === 'quick' ? ['--scale=0.5'] : []),
  ...(mode === 'final' ? ['--concurrency=8'] : []),
  '--pixel-format=yuv420p',
  '--audio-bitrate=192k',
  `--props=${JSON.stringify({project, captions})}`,
], {stdio: 'inherit'});
execFileSync('node', [
  'scripts/inspect-render.mjs', output,
  `--project=${projectFile}`,
  `--qc-dir=${qcDir}`,
], {stdio: 'inherit'});

console.log(`\n✓ ${project.series.chapter} ${mode === 'final' ? '正式成片' : '预览片'}：${path.resolve(root, output)}`);
