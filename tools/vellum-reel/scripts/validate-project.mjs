import {execFileSync} from 'node:child_process';
import {access} from 'node:fs/promises';
import {publicPath, readJson, resolveArg} from './_shared.mjs';
import {validateNarrativeBeats} from './narrative-beats.mjs';

const project = await readJson(resolveArg('project', 'project.json'));
const captions = await readJson(resolveArg('captions', 'captions.json'));
const errors = [];
const warnings = [];
const totalMs = project.format.durationSeconds * 1000;

if (project.format.width / project.format.height !== 9 / 16) {
  errors.push(`画面不是 9:16：${project.format.width}x${project.format.height}`);
}
if (!Array.isArray(project.scenes) || project.scenes.length === 0) errors.push('至少需要一个 scene');
if (!Array.isArray(captions) || captions.length === 0) errors.push('至少需要一条 caption');
if (!project.audio.narration) warnings.push('尚未配置旁白；只适合视觉预览，不应作为正式成片发布');

errors.push(...validateNarrativeBeats(project.narrative?.beats ?? [], totalMs));

for (let index = 0; index < project.scenes.length; index += 1) {
  const scene = project.scenes[index];
  if (scene.endMs <= scene.startMs) errors.push(`scene ${index + 1} 的 endMs 必须大于 startMs`);
  if (scene.endMs > totalMs) errors.push(`scene ${index + 1} 超出视频时长`);
  if (index === 0 && scene.startMs !== 0) errors.push('第一个 scene 必须从 0ms 开始');
  if (index > 0 && scene.startMs !== project.scenes[index - 1].endMs) {
    errors.push(`scene ${index} 与 ${index + 1} 存在缝隙或重叠`);
  }
}
if (project.scenes.at(-1)?.endMs !== totalMs) errors.push('最后一个 scene 必须覆盖到视频结尾');

for (let index = 0; index < captions.length; index += 1) {
  const caption = captions[index];
  if (!caption.text?.trim()) errors.push(`caption ${index + 1} 文本为空`);
  if (caption.endMs <= caption.startMs) errors.push(`caption ${index + 1} 的 endMs 必须大于 startMs`);
  if (caption.endMs > totalMs) errors.push(`caption ${index + 1} 超出视频时长`);
  if (index > 0 && caption.startMs < captions[index - 1].endMs) {
    errors.push(`caption ${index} 与 ${index + 1} 时间重叠`);
  }
  if ([...caption.text].length > 24) errors.push(`caption ${index + 1} 超过 24 个字：${caption.text}`);
  if (index > 0 && caption.startMs - captions[index - 1].endMs > 5000) {
    warnings.push(`caption ${index} 与 ${index + 1} 之间留白超过 5 秒`);
  }
}

for (const media of [project.audio.narration, project.audio.bgm, ...project.scenes.map((scene) => scene.image)]) {
  if (!media) continue;
  try {
    await access(publicPath(media));
  } catch {
    errors.push(`素材不存在：public/${media}`);
  }
}

if (project.audio.narration) {
  try {
    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', publicPath(project.audio.narration)],
        {encoding: 'utf8'},
      ),
    );
    const audioMs = Number(probe.format.duration) * 1000;
    if (audioMs > totalMs) errors.push(`旁白比视频长 ${((audioMs - totalMs) / 1000).toFixed(2)} 秒，请运行 npm run timeline:sync`);
    if (totalMs - audioMs > 5000) warnings.push(`视频比旁白长 ${((totalMs - audioMs) / 1000).toFixed(2)} 秒`);
  } catch {
    // Missing media is already reported above; avoid duplicating the same error.
  }
}

if (errors.length) {
  console.error(`项目校验失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (warnings.length) {
  console.warn(`项目提醒（${warnings.length} 项）：`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

console.log(`项目校验通过：${project.scenes.length} 个画面段，${captions.length} 条字幕，${project.format.durationSeconds} 秒。`);
