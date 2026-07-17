import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {readJson, resolveArg, root} from './_shared.mjs';

const bookDir = resolveArg('book', 'examples/book-demo');
const mode = resolveArg('mode', 'quick');
if (!['quick', 'final'].includes(mode)) throw new Error('--mode 只能是 quick 或 final');

const projectFile = path.join(bookDir, 'project.json');
const captionsFile = path.join(bookDir, 'captions.json');
const project = await readJson(projectFile);
const captions = await readJson(captionsFile);
if (mode === 'final' && !project.audio?.narration) {
  throw new Error('正式渲染需要旁白。请配置 project.audio.narration，或先使用 --mode=quick 检查视觉。');
}
const slug = path.basename(bookDir);
const output = path.join('out', slug, mode === 'final' ? 'book-video.mp4' : 'book-video-preview.mp4');
const qcDir = path.join('out', slug, 'qc');

execFileSync('node', ['scripts/validate-project.mjs', `--project=${projectFile}`, `--captions=${captionsFile}`], {stdio: 'inherit'});
execFileSync('npx', [
  'remotion', 'render', 'src/index.ts', 'BookVideo', output,
  '--codec=h264',
  mode === 'final' ? '--crf=18' : '--crf=24',
  ...(mode === 'quick' ? ['--scale=0.5'] : []),
  '--pixel-format=yuv420p',
  `--props=${JSON.stringify({project, captions})}`,
], {stdio: 'inherit'});
execFileSync('node', [
  'scripts/inspect-render.mjs', output,
  `--project=${projectFile}`,
  `--qc-dir=${qcDir}`,
], {stdio: 'inherit'});

console.log(`\n✓ ${project.book.title} ${mode === 'final' ? '正式成片' : '预览片'}：${path.resolve(root, output)}`);
