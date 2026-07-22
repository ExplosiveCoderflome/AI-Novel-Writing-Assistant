import {spawnSync} from 'node:child_process';
import {readJson, resolveArg} from './_shared.mjs';

const mode = resolveArg('mode', 'quick');
const shouldAlign = process.argv.includes('--align');
const allowSilent = process.argv.includes('--allow-silent');
const project = await readJson('project.json');

if (!['quick', 'final'].includes(mode)) throw new Error('--mode 只能是 quick 或 final。');
if (mode === 'final' && !project.audio.narration && !allowSilent) {
  throw new Error('正式渲染已中止：尚未配置旁白。如果确实需要静音版，传入 --allow-silent。');
}

const run = (command, args) => {
  console.log(`\n▶ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {stdio: 'inherit', env: process.env});
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (shouldAlign) {
  if (!project.audio.narration) throw new Error('--align 需要 project.audio.narration。');
  run('node', ['scripts/transcribe-local.mjs']);
}
if (project.audio.narration) run('node', ['scripts/sync-timeline.mjs']);

run('npm', ['run', 'check']);
run('npm', ['run', mode === 'final' ? 'render' : 'render:quick']);
run('node', [
  'scripts/inspect-render.mjs',
  mode === 'final' ? 'out/book-video.mp4' : 'out/book-video-preview.mp4',
]);

console.log(`\n✓ ${mode === 'final' ? '正式成片' : '预览片'}生产流程完成。`);
